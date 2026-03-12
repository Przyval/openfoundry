import type { ObjectTypeDefinition } from "./object-type.js";
import type { ActionTypeDefinition } from "./action-type.js";
import type { LinkTypeDefinition } from "./link-type.js";
import type { InterfaceTypeDefinition } from "./interface-type.js";
import type { QueryTypeDefinition } from "./query-type.js";

// ---------------------------------------------------------------------------
// OntologyDefinition
// ---------------------------------------------------------------------------

/**
 * The top-level ontology definition — a complete, self-contained description
 * of all entity types, actions, links, interfaces, and queries that make up
 * an ontology.
 *
 * This is the root type that serialisation, code generation, and validation
 * tools operate on.
 */
export interface OntologyDefinition {
  /** The resource identifier of this ontology. */
  readonly rid: string;

  /** Unique API name used to reference this ontology programmatically. */
  readonly apiName: string;

  /** Human-readable display name shown in the UI. */
  readonly displayName: string;

  /** Human-readable description of the ontology's purpose and scope. */
  readonly description: string;

  /** All object types in this ontology, keyed by object type apiName. */
  readonly objectTypes: Record<string, ObjectTypeDefinition>;

  /** All action types in this ontology, keyed by action type apiName. */
  readonly actionTypes: Record<string, ActionTypeDefinition>;

  /** All link types in this ontology, keyed by link type apiName. */
  readonly linkTypes: Record<string, LinkTypeDefinition>;

  /** All interface types in this ontology, keyed by interface type apiName. */
  readonly interfaceTypes: Record<string, InterfaceTypeDefinition>;

  /** All query types in this ontology, keyed by query type apiName. */
  readonly queryTypes: Record<string, QueryTypeDefinition>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface OntologyValidationError {
  readonly path: string;
  readonly message: string;
}

/**
 * Validates cross-references within an OntologyDefinition.
 *
 * Checks that:
 * - Link types reference existing object types
 * - Object type `implements` references existing interfaces
 * - Interface `extendsInterfaces` references existing interfaces
 * - Action type `modifiedEntities` references existing object types
 * - Query outputs reference existing object types
 *
 * Returns an array of errors; an empty array indicates a valid ontology.
 */
export function validateOntology(
  def: OntologyDefinition,
): OntologyValidationError[] {
  const errors: OntologyValidationError[] = [];

  if (!def.rid || def.rid.trim().length === 0) {
    errors.push({ path: "rid", message: "rid must be non-empty" });
  }

  if (!def.apiName || def.apiName.trim().length === 0) {
    errors.push({ path: "apiName", message: "apiName must be non-empty" });
  }

  // Validate link type references
  for (const [name, link] of Object.entries(def.linkTypes)) {
    if (!(link.objectTypeApiName in def.objectTypes)) {
      errors.push({
        path: `linkTypes.${name}.objectTypeApiName`,
        message: `references unknown object type "${link.objectTypeApiName}"`,
      });
    }
    if (!(link.linkedObjectTypeApiName in def.objectTypes)) {
      errors.push({
        path: `linkTypes.${name}.linkedObjectTypeApiName`,
        message: `references unknown object type "${link.linkedObjectTypeApiName}"`,
      });
    }
  }

  // Validate object type interface implementations
  for (const [name, obj] of Object.entries(def.objectTypes)) {
    for (const iface of obj.implements) {
      if (!(iface in def.interfaceTypes)) {
        errors.push({
          path: `objectTypes.${name}.implements`,
          message: `references unknown interface "${iface}"`,
        });
      }
    }
  }

  // Validate interface extensions
  for (const [name, iface] of Object.entries(def.interfaceTypes)) {
    for (const parent of iface.extendsInterfaces) {
      if (!(parent in def.interfaceTypes)) {
        errors.push({
          path: `interfaceTypes.${name}.extendsInterfaces`,
          message: `references unknown interface "${parent}"`,
        });
      }
    }
  }

  // Validate action type modified entities
  for (const [name, action] of Object.entries(def.actionTypes)) {
    for (const entityName of Object.keys(action.modifiedEntities)) {
      if (!(entityName in def.objectTypes)) {
        errors.push({
          path: `actionTypes.${name}.modifiedEntities`,
          message: `references unknown object type "${entityName}"`,
        });
      }
    }
  }

  return errors;
}
