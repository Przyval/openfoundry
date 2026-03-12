/**
 * Serialization and deserialization utilities for OntologyIr.
 */

import type {
  OntologyIr,
  ObjectTypeIr,
  ActionTypeIr,
  LinkTypeIr,
  InterfaceTypeIr,
  QueryTypeIr,
  PropertyIr,
  ParameterIr,
  QueryOutputIr,
  OntologyMetadata,
  PropertyTypeIr,
} from "./ontology-ir.js";

import { PROPERTY_TYPE_IR_VALUES } from "./ontology-ir.js";

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes an OntologyIr to a JSON string with 2-space indentation.
 */
export function serializeOntologyIr(ir: OntologyIr): string {
  return JSON.stringify(ir, null, 2);
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

/**
 * Deserializes a JSON string to an OntologyIr, validating the structure.
 *
 * @throws {Error} if the JSON is malformed or fails structural validation.
 */
export function deserializeOntologyIr(json: string): OntologyIr {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON: failed to parse input string");
  }

  if (!validateOntologyIr(parsed)) {
    throw new Error("Invalid OntologyIr: structural validation failed");
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPropertyTypeIr(value: unknown): value is PropertyTypeIr {
  return isString(value) && PROPERTY_TYPE_IR_VALUES.includes(value as PropertyTypeIr);
}

function isValidPropertyIr(value: unknown): value is PropertyIr {
  if (!isRecord(value)) return false;
  if (!isString(value.apiName)) return false;
  if (!isPropertyTypeIr(value.type)) return false;
  if (!isBoolean(value.nullable)) return false;
  if (!isBoolean(value.array)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  return true;
}

function isValidPropertiesRecord(
  value: unknown,
): value is Record<string, PropertyIr> {
  if (!isRecord(value)) return false;
  for (const prop of Object.values(value)) {
    if (!isValidPropertyIr(prop)) return false;
  }
  return true;
}

function isValidParameterIr(value: unknown): value is ParameterIr {
  if (!isRecord(value)) return false;
  if (!isPropertyTypeIr(value.type)) return false;
  if (!isBoolean(value.required)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  return true;
}

function isValidParametersRecord(
  value: unknown,
): value is Record<string, ParameterIr> {
  if (!isRecord(value)) return false;
  for (const param of Object.values(value)) {
    if (!isValidParameterIr(param)) return false;
  }
  return true;
}

function isValidObjectTypeIr(value: unknown): value is ObjectTypeIr {
  if (!isRecord(value)) return false;
  if (!isString(value.apiName)) return false;
  if (!isString(value.primaryKey)) return false;
  if (!isValidPropertiesRecord(value.properties)) return false;
  if (!Array.isArray(value.implements)) return false;
  for (const i of value.implements) {
    if (!isString(i)) return false;
  }
  if (value.titleProperty !== undefined && !isString(value.titleProperty)) return false;
  if (!isString(value.status)) return false;
  return true;
}

function isValidModifiedEntity(value: unknown): value is { objectType: string; modification: "CREATED" | "MODIFIED" | "DELETED" } {
  if (!isRecord(value)) return false;
  if (!isString(value.objectType)) return false;
  if (!isString(value.modification)) return false;
  if (!["CREATED", "MODIFIED", "DELETED"].includes(value.modification as string)) return false;
  return true;
}

function isValidActionTypeIr(value: unknown): value is ActionTypeIr {
  if (!isRecord(value)) return false;
  if (!isString(value.apiName)) return false;
  if (!isValidParametersRecord(value.parameters)) return false;
  if (!Array.isArray(value.modifiedEntities)) return false;
  for (const entity of value.modifiedEntities) {
    if (!isValidModifiedEntity(entity)) return false;
  }
  return true;
}

function isValidLinkTypeIr(value: unknown): value is LinkTypeIr {
  if (!isRecord(value)) return false;
  if (!isString(value.apiName)) return false;
  if (!isString(value.objectTypeA)) return false;
  if (!isString(value.objectTypeB)) return false;
  if (!isString(value.cardinality)) return false;
  if (!["ONE", "MANY"].includes(value.cardinality as string)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  return true;
}

function isValidInterfaceTypeIr(value: unknown): value is InterfaceTypeIr {
  if (!isRecord(value)) return false;
  if (!isString(value.apiName)) return false;
  if (!isValidPropertiesRecord(value.properties)) return false;
  if (!Array.isArray(value.extendsInterfaces)) return false;
  for (const i of value.extendsInterfaces) {
    if (!isString(i)) return false;
  }
  return true;
}

function isValidQueryOutputIr(value: unknown): value is QueryOutputIr {
  if (!isRecord(value)) return false;
  // { type: PropertyTypeIr }
  if ("type" in value && isPropertyTypeIr(value.type)) return true;
  // { objectType: string }
  if ("objectType" in value && isString(value.objectType)) return true;
  // { list: QueryOutputIr }
  if ("list" in value && isValidQueryOutputIr(value.list)) return true;
  return false;
}

function isValidQueryTypeIr(value: unknown): value is QueryTypeIr {
  if (!isRecord(value)) return false;
  if (!isString(value.apiName)) return false;
  if (!isString(value.version)) return false;
  if (!isValidParametersRecord(value.parameters)) return false;
  if (!isValidQueryOutputIr(value.output)) return false;
  return true;
}

function isValidOntologyMetadata(value: unknown): value is OntologyMetadata {
  if (!isRecord(value)) return false;
  if (!isString(value.createdAt)) return false;
  if (!isString(value.updatedAt)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  return true;
}

function isValidRecordOf<T>(
  value: unknown,
  validator: (v: unknown) => v is T,
): value is Record<string, T> {
  if (!isRecord(value)) return false;
  for (const item of Object.values(value)) {
    if (!validator(item)) return false;
  }
  return true;
}

/**
 * Type guard that performs structural validation on an unknown value,
 * returning true if it conforms to the OntologyIr shape.
 */
export function validateOntologyIr(ir: unknown): ir is OntologyIr {
  if (!isRecord(ir)) return false;
  if (!isString(ir.apiName)) return false;
  if (!isString(ir.version)) return false;
  if (!isValidRecordOf(ir.objectTypes, isValidObjectTypeIr)) return false;
  if (!isValidRecordOf(ir.actionTypes, isValidActionTypeIr)) return false;
  if (!isValidRecordOf(ir.linkTypes, isValidLinkTypeIr)) return false;
  if (!isValidRecordOf(ir.interfaceTypes, isValidInterfaceTypeIr)) return false;
  if (!isValidRecordOf(ir.queryTypes, isValidQueryTypeIr)) return false;
  if (!isValidOntologyMetadata(ir.metadata)) return false;
  return true;
}
