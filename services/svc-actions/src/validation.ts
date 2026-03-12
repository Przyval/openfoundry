import { PropertyType } from "@openfoundry/ontology-schema";
import type { RegisteredAction } from "./store/action-registry.js";

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------

export interface ValidationError {
  /** The parameter name that failed validation. */
  readonly parameter: string;

  /** Human-readable error message. */
  readonly message: string;

  /** Machine-readable error code. */
  readonly code: string;
}

export interface ValidationResult {
  /** Whether all parameters are valid. */
  readonly valid: boolean;

  /** List of validation errors (empty when valid). */
  readonly errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// Type checking helpers
// ---------------------------------------------------------------------------

const ISO_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

const RID_RE = /^ri\.[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+\.[a-zA-Z0-9._-]+$/;

function isValidForType(value: unknown, type: PropertyType): boolean {
  switch (type) {
    case PropertyType.STRING:
      return typeof value === "string";

    case PropertyType.BOOLEAN:
      return typeof value === "boolean";

    case PropertyType.INTEGER:
    case PropertyType.SHORT:
    case PropertyType.BYTE:
      return typeof value === "number" && Number.isInteger(value);

    case PropertyType.LONG:
      return typeof value === "number" && Number.isInteger(value);

    case PropertyType.DOUBLE:
    case PropertyType.FLOAT:
    case PropertyType.DECIMAL:
      return typeof value === "number";

    case PropertyType.DATE:
      return typeof value === "string" && !isNaN(Date.parse(value));

    case PropertyType.TIMESTAMP:
      return typeof value === "string" && ISO_TIMESTAMP_RE.test(value);

    case PropertyType.RID:
    case PropertyType.ATTACHMENT:
    case PropertyType.MARKING:
    case PropertyType.MEDIA_REFERENCE:
      return typeof value === "string" && RID_RE.test(value);

    case PropertyType.GEOHASH:
      return typeof value === "string";

    case PropertyType.GEOPOINT:
      return (
        typeof value === "object" &&
        value !== null &&
        "latitude" in value &&
        "longitude" in value &&
        typeof (value as Record<string, unknown>).latitude === "number" &&
        typeof (value as Record<string, unknown>).longitude === "number"
      );

    case PropertyType.GEOSHAPE:
      return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        "coordinates" in value
      );

    case PropertyType.VECTOR:
      return Array.isArray(value) && value.every((v) => typeof v === "number");

    case PropertyType.TIMESERIES:
      return (
        typeof value === "object" &&
        value !== null &&
        "seriesId" in value &&
        "type" in value
      );

    case PropertyType.STRUCT:
      return typeof value === "object" && value !== null && !Array.isArray(value);

    default:
      return true;
  }
}

function typeLabel(type: PropertyType): string {
  return type.toLowerCase();
}

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validates parameters against a registered action's parameter definitions.
 *
 * Checks:
 * 1. All required parameters are present
 * 2. All supplied parameters are defined on the action
 * 3. Parameter values match their declared type
 */
export function validateActionParameters(
  params: Record<string, unknown>,
  action: RegisteredAction,
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check required parameters are present
  for (const [name, def] of action.parameters) {
    if (def.required && (params[name] === undefined || params[name] === null)) {
      errors.push({
        parameter: name,
        message: `Required parameter '${name}' is missing`,
        code: "REQUIRED_PARAMETER_MISSING",
      });
    }
  }

  // Check for unknown parameters and type-check known ones
  for (const [name, value] of Object.entries(params)) {
    const def = action.parameters.get(name);

    if (!def) {
      errors.push({
        parameter: name,
        message: `Unknown parameter '${name}'`,
        code: "UNKNOWN_PARAMETER",
      });
      continue;
    }

    // Skip null/undefined for optional params (already caught required above)
    if (value === undefined || value === null) continue;

    if (!isValidForType(value, def.type)) {
      errors.push({
        parameter: name,
        message: `Parameter '${name}' must be of type ${typeLabel(def.type)}`,
        code: "INVALID_PARAMETER_TYPE",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
