import type { PropertyDef } from "./property-types.js";

// ---------------------------------------------------------------------------
// InterfaceTypeDefinition
// ---------------------------------------------------------------------------

/**
 * Defines an interface type in the ontology — a contract that object types
 * can implement to guarantee a set of properties.
 *
 * Interfaces support single inheritance via `extendsInterfaces`, allowing
 * hierarchical type composition.
 */
export interface InterfaceTypeDefinition {
  /** Unique API name used to reference this interface type programmatically. */
  readonly apiName: string;

  /** Human-readable description of what this interface represents. */
  readonly description: string;

  /**
   * Properties that implementing object types must include,
   * keyed by property apiName.
   */
  readonly properties: Record<string, PropertyDef>;

  /**
   * Interface apiNames that this interface extends.
   * An implementing object type must also satisfy all ancestor interfaces.
   */
  readonly extendsInterfaces: readonly string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface InterfaceTypeValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validates an InterfaceTypeDefinition, returning an array of errors.
 * An empty array indicates a valid definition.
 */
export function validateInterfaceType(
  def: InterfaceTypeDefinition,
): InterfaceTypeValidationError[] {
  const errors: InterfaceTypeValidationError[] = [];

  if (!def.apiName || def.apiName.trim().length === 0) {
    errors.push({ field: "apiName", message: "apiName must be non-empty" });
  }

  if (!def.description || def.description.trim().length === 0) {
    errors.push({
      field: "description",
      message: "description must be non-empty",
    });
  }

  // Detect circular self-reference at the immediate level
  if (def.extendsInterfaces.includes(def.apiName)) {
    errors.push({
      field: "extendsInterfaces",
      message: "interface must not extend itself",
    });
  }

  return errors;
}
