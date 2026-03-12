import type { PropertyDef, PropertyType } from "./property-types.js";

// ---------------------------------------------------------------------------
// Object type status
// ---------------------------------------------------------------------------

export const ObjectTypeStatus = {
  ACTIVE: "ACTIVE",
  EXPERIMENTAL: "EXPERIMENTAL",
  DEPRECATED: "DEPRECATED",
} as const;

export type ObjectTypeStatus =
  (typeof ObjectTypeStatus)[keyof typeof ObjectTypeStatus];

// ---------------------------------------------------------------------------
// ObjectTypeDefinition
// ---------------------------------------------------------------------------

/**
 * Defines an object type in the ontology — the fundamental entity that users
 * create, query, and link together.
 *
 * Mirrors the Palantir ObjectType specification with apiName-based addressing,
 * a typed primary key, and optional interface conformance.
 */
export interface ObjectTypeDefinition {
  /** Unique API name used to reference this object type programmatically. */
  readonly apiName: string;

  /** Human-readable description of what this object type represents. */
  readonly description: string;

  /**
   * The apiName of the property that serves as the primary key.
   * Must reference a key in `properties`.
   */
  readonly primaryKeyApiName: string;

  /** The property type of the primary key (e.g. "STRING", "INTEGER", "RID"). */
  readonly primaryKeyType: PropertyType;

  /**
   * The apiName of the property used as the display title.
   * Must reference a key in `properties`.
   */
  readonly titlePropertyApiName: string;

  /** All properties defined on this object type, keyed by property apiName. */
  readonly properties: Record<string, PropertyDef>;

  /**
   * Interface apiNames that this object type implements.
   * The object type must satisfy all property constraints of each interface.
   */
  readonly implements: readonly string[];

  /** Lifecycle status of this object type. */
  readonly status: ObjectTypeStatus;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ObjectTypeValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validates an ObjectTypeDefinition, returning an array of errors.
 * An empty array indicates a valid definition.
 */
export function validateObjectType(
  def: ObjectTypeDefinition,
): ObjectTypeValidationError[] {
  const errors: ObjectTypeValidationError[] = [];

  if (!def.apiName || def.apiName.trim().length === 0) {
    errors.push({ field: "apiName", message: "apiName must be non-empty" });
  }

  if (!def.description || def.description.trim().length === 0) {
    errors.push({
      field: "description",
      message: "description must be non-empty",
    });
  }

  if (!def.properties || Object.keys(def.properties).length === 0) {
    errors.push({
      field: "properties",
      message: "object type must define at least one property",
    });
  }

  if (
    def.primaryKeyApiName &&
    def.properties &&
    !(def.primaryKeyApiName in def.properties)
  ) {
    errors.push({
      field: "primaryKeyApiName",
      message: `primary key "${def.primaryKeyApiName}" is not defined in properties`,
    });
  }

  if (
    def.titlePropertyApiName &&
    def.properties &&
    !(def.titlePropertyApiName in def.properties)
  ) {
    errors.push({
      field: "titlePropertyApiName",
      message: `title property "${def.titlePropertyApiName}" is not defined in properties`,
    });
  }

  if (
    def.primaryKeyApiName &&
    def.properties &&
    def.primaryKeyApiName in def.properties
  ) {
    const pkProp = def.properties[def.primaryKeyApiName];
    if (pkProp.nullable) {
      errors.push({
        field: "primaryKeyApiName",
        message: "primary key property must not be nullable",
      });
    }
  }

  return errors;
}
