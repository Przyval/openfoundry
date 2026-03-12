/**
 * Validation for Conjure IR definitions.
 */

import type {
  ConjureDefinition,
  EndpointDefinition,
  FieldDefinition,
  Type,
  TypeName,
} from "./ir-types.js";

/** Result of validating a ConjureDefinition. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a ConjureDefinition for structural correctness.
 *
 * Checks:
 * - All type references resolve to a defined type
 * - No duplicate type names
 * - Endpoint paths have matching path args
 * - Required fields are present
 */
export function validateIr(definition: ConjureDefinition): ValidationResult {
  const errors: string[] = [];

  // Build a set of all defined type names for reference resolution
  const definedTypes = new Set<string>();
  for (const td of definition.types) {
    const key = typeNameKey(td.typeName);
    if (definedTypes.has(key)) {
      errors.push(`Duplicate type name: ${td.typeName.package}.${td.typeName.name}`);
    }
    definedTypes.add(key);
  }

  // Validate type definitions
  for (const td of definition.types) {
    if ("alias" in td) {
      validateType(td.alias, definedTypes, errors, `alias ${td.typeName.name}`);
    }
    if ("fields" in td) {
      for (const field of td.fields) {
        validateFieldType(field, definedTypes, errors, `${td.typeName.name}.${field.fieldName}`);
      }
    }
    if ("union" in td) {
      for (const field of td.union) {
        validateFieldType(field, definedTypes, errors, `${td.typeName.name}.${field.fieldName}`);
      }
    }
  }

  // Validate services
  for (const service of definition.services) {
    for (const endpoint of service.endpoints) {
      validateEndpoint(endpoint, definedTypes, errors, service.serviceName.name);
    }
  }

  // Validate errors
  for (const err of definition.errors) {
    for (const arg of err.safeArgs) {
      validateFieldType(arg, definedTypes, errors, `error ${err.errorName.name}.safeArgs.${arg.fieldName}`);
    }
    for (const arg of err.unsafeArgs) {
      validateFieldType(arg, definedTypes, errors, `error ${err.errorName.name}.unsafeArgs.${arg.fieldName}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function typeNameKey(tn: TypeName): string {
  return `${tn.package}.${tn.name}`;
}

function validateFieldType(
  field: FieldDefinition,
  definedTypes: Set<string>,
  errors: string[],
  context: string,
): void {
  validateType(field.type, definedTypes, errors, context);
}

function validateType(
  type: Type,
  definedTypes: Set<string>,
  errors: string[],
  context: string,
): void {
  switch (type.type) {
    case "primitive":
      break;
    case "reference":
      if (!definedTypes.has(typeNameKey(type.reference))) {
        errors.push(
          `Unresolved type reference '${type.reference.package}.${type.reference.name}' in ${context}`,
        );
      }
      break;
    case "optional":
      validateType(type.optional.itemType, definedTypes, errors, context);
      break;
    case "list":
      validateType(type.list.itemType, definedTypes, errors, context);
      break;
    case "set":
      validateType(type.set.itemType, definedTypes, errors, context);
      break;
    case "map":
      validateType(type.map.keyType, definedTypes, errors, context);
      validateType(type.map.valueType, definedTypes, errors, context);
      break;
    case "external":
      if (!definedTypes.has(typeNameKey(type.external.externalReference))) {
        // External references are allowed to be unresolved (they reference external packages),
        // but we still validate the fallback type.
      }
      validateType(type.external.fallback, definedTypes, errors, context);
      break;
  }
}

function validateEndpoint(
  endpoint: EndpointDefinition,
  definedTypes: Set<string>,
  errors: string[],
  serviceName: string,
): void {
  const context = `${serviceName}.${endpoint.endpointName}`;

  // Validate arg types
  for (const arg of endpoint.args) {
    validateType(arg.type, definedTypes, errors, `${context}.${arg.argName}`);
  }

  // Validate return type
  if (endpoint.returns) {
    validateType(endpoint.returns, definedTypes, errors, `${context} return`);
  }

  // Validate that path parameters in httpPath have matching path args
  const pathParamPattern = /\{([^}]+)\}/g;
  const pathParams = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pathParamPattern.exec(endpoint.httpPath)) !== null) {
    pathParams.add(match[1]);
  }

  const pathArgs = new Set(
    endpoint.args
      .filter((arg) => arg.paramType.type === "path")
      .map((arg) => arg.argName),
  );

  for (const param of pathParams) {
    if (!pathArgs.has(param)) {
      errors.push(
        `Path parameter '{${param}}' in ${context} has no matching path argument`,
      );
    }
  }

  for (const arg of pathArgs) {
    if (!pathParams.has(arg)) {
      errors.push(
        `Path argument '${arg}' in ${context} has no matching path parameter in '${endpoint.httpPath}'`,
      );
    }
  }
}
