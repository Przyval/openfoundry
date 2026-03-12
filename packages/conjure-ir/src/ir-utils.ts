/**
 * Utility functions for working with Conjure IR definitions.
 */

import type {
  AliasDefinition,
  ConjureDefinition,
  EndpointDefinition,
  EnumDefinition,
  ObjectDefinition,
  PrimitiveType,
  Type,
  TypeDefinition,
  TypeName,
  UnionDefinition,
} from "./ir-types.js";

/** Find a type definition by its TypeName. */
export function getTypeDefinition(
  ir: ConjureDefinition,
  tn: TypeName,
): TypeDefinition | undefined {
  return ir.types.find(
    (td) => td.typeName.name === tn.name && td.typeName.package === tn.package,
  );
}

/** Get all TypeNames defined in the IR. */
export function getAllTypeNames(ir: ConjureDefinition): TypeName[] {
  return ir.types.map((td) => td.typeName);
}

/** Get all endpoints across all services. */
export function getAllEndpoints(ir: ConjureDefinition): EndpointDefinition[] {
  return ir.services.flatMap((s) => s.endpoints);
}

/**
 * Resolve a Type to its underlying TypeDefinition or PrimitiveType.
 * Returns undefined if the type cannot be resolved (e.g., unresolved reference).
 * For container types (optional, list, set, map), returns undefined since
 * they don't resolve to a single definition or primitive.
 */
export function resolveType(
  ir: ConjureDefinition,
  type: Type,
): TypeDefinition | PrimitiveType | undefined {
  switch (type.type) {
    case "primitive":
      return type.primitive;
    case "reference":
      return getTypeDefinition(ir, type.reference);
    case "external":
      return resolveType(ir, type.external.fallback);
    default:
      return undefined;
  }
}

/** Type guard: checks if a TypeDefinition is an ObjectDefinition. */
export function isObjectDefinition(td: TypeDefinition): td is ObjectDefinition {
  return "fields" in td && !("union" in td);
}

/** Type guard: checks if a TypeDefinition is an EnumDefinition. */
export function isEnumDefinition(td: TypeDefinition): td is EnumDefinition {
  return "values" in td;
}

/** Type guard: checks if a TypeDefinition is an AliasDefinition. */
export function isAliasDefinition(td: TypeDefinition): td is AliasDefinition {
  return "alias" in td;
}

/** Type guard: checks if a TypeDefinition is a UnionDefinition. */
export function isUnionDefinition(td: TypeDefinition): td is UnionDefinition {
  return "union" in td;
}
