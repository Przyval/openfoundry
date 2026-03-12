// ---------------------------------------------------------------------------
// Link cardinality
// ---------------------------------------------------------------------------

export const LinkCardinality = {
  ONE: "ONE",
  MANY: "MANY",
} as const;

export type LinkCardinality =
  (typeof LinkCardinality)[keyof typeof LinkCardinality];

// ---------------------------------------------------------------------------
// LinkTypeDefinition
// ---------------------------------------------------------------------------

/**
 * Defines a link type in the ontology — a typed, directed relationship
 * between two object types.
 *
 * Links are expressed as a foreign key on the source object type that
 * references the primary key of the target object type.
 */
export interface LinkTypeDefinition {
  /** Unique API name used to reference this link type programmatically. */
  readonly apiName: string;

  /** The apiName of the source object type (the "from" side). */
  readonly objectTypeApiName: string;

  /** The apiName of the target object type (the "to" side). */
  readonly linkedObjectTypeApiName: string;

  /** Whether each source object links to one or many target objects. */
  readonly cardinality: LinkCardinality;

  /**
   * The apiName of the property on the source object type that serves
   * as the foreign key referencing the target's primary key.
   */
  readonly foreignKeyPropertyApiName: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface LinkTypeValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validates a LinkTypeDefinition, returning an array of errors.
 * An empty array indicates a valid definition.
 */
export function validateLinkType(
  def: LinkTypeDefinition,
): LinkTypeValidationError[] {
  const errors: LinkTypeValidationError[] = [];

  if (!def.apiName || def.apiName.trim().length === 0) {
    errors.push({ field: "apiName", message: "apiName must be non-empty" });
  }

  if (!def.objectTypeApiName || def.objectTypeApiName.trim().length === 0) {
    errors.push({
      field: "objectTypeApiName",
      message: "objectTypeApiName must be non-empty",
    });
  }

  if (
    !def.linkedObjectTypeApiName ||
    def.linkedObjectTypeApiName.trim().length === 0
  ) {
    errors.push({
      field: "linkedObjectTypeApiName",
      message: "linkedObjectTypeApiName must be non-empty",
    });
  }

  if (
    !def.foreignKeyPropertyApiName ||
    def.foreignKeyPropertyApiName.trim().length === 0
  ) {
    errors.push({
      field: "foreignKeyPropertyApiName",
      message: "foreignKeyPropertyApiName must be non-empty",
    });
  }

  if (def.objectTypeApiName === def.linkedObjectTypeApiName) {
    errors.push({
      field: "linkedObjectTypeApiName",
      message:
        "self-referential links are not supported; objectTypeApiName and linkedObjectTypeApiName must differ",
    });
  }

  return errors;
}
