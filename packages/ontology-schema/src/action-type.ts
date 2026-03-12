import type { PropertyType } from "./property-types.js";

// ---------------------------------------------------------------------------
// Action parameter
// ---------------------------------------------------------------------------

export interface ActionParameter {
  /** Human-readable description of this parameter. */
  readonly description?: string;

  /** The data type of this parameter. */
  readonly type: PropertyType;

  /** Whether this parameter is required. */
  readonly required: boolean;

  /**
   * For parameters that reference an object type, the apiName of that type.
   * Used for object-set or object-reference parameters.
   */
  readonly objectTypeApiName?: string;
}

// ---------------------------------------------------------------------------
// Modified entity spec
// ---------------------------------------------------------------------------

export interface ModifiedEntity {
  /** Whether this action can create instances of the entity. */
  readonly created: boolean;

  /** Whether this action can modify existing instances of the entity. */
  readonly modified: boolean;
}

// ---------------------------------------------------------------------------
// Action type status
// ---------------------------------------------------------------------------

export const ActionTypeStatus = {
  ACTIVE: "ACTIVE",
  EXPERIMENTAL: "EXPERIMENTAL",
  DEPRECATED: "DEPRECATED",
} as const;

export type ActionTypeStatus =
  (typeof ActionTypeStatus)[keyof typeof ActionTypeStatus];

// ---------------------------------------------------------------------------
// ActionTypeDefinition
// ---------------------------------------------------------------------------

/**
 * Defines an action type in the ontology — a named mutation that can create,
 * modify, or delete object instances.
 *
 * Actions declare their parameters, the entities they touch, and their
 * lifecycle status.
 */
export interface ActionTypeDefinition {
  /** Unique API name used to reference this action type programmatically. */
  readonly apiName: string;

  /** Human-readable description of what this action does. */
  readonly description: string;

  /** Parameters accepted by this action, keyed by parameter apiName. */
  readonly parameters: Record<string, ActionParameter>;

  /**
   * Object types that this action may create or modify, keyed by object
   * type apiName.
   */
  readonly modifiedEntities: Record<string, ModifiedEntity>;

  /** Lifecycle status of this action type. */
  readonly status: ActionTypeStatus;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ActionTypeValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validates an ActionTypeDefinition, returning an array of errors.
 * An empty array indicates a valid definition.
 */
export function validateActionType(
  def: ActionTypeDefinition,
): ActionTypeValidationError[] {
  const errors: ActionTypeValidationError[] = [];

  if (!def.apiName || def.apiName.trim().length === 0) {
    errors.push({ field: "apiName", message: "apiName must be non-empty" });
  }

  if (!def.description || def.description.trim().length === 0) {
    errors.push({
      field: "description",
      message: "description must be non-empty",
    });
  }

  for (const [name, entity] of Object.entries(def.modifiedEntities)) {
    if (!entity.created && !entity.modified) {
      errors.push({
        field: `modifiedEntities.${name}`,
        message: `entity "${name}" must have at least one of created or modified set to true`,
      });
    }
  }

  return errors;
}
