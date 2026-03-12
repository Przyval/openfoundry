import type { PropertyType } from "./property-types.js";

// ---------------------------------------------------------------------------
// Query parameter
// ---------------------------------------------------------------------------

export interface QueryParameter {
  /** Human-readable description of this parameter. */
  readonly description?: string;

  /** The data type of this parameter. */
  readonly type: PropertyType;

  /** Whether this parameter is required. */
  readonly required: boolean;
}

// ---------------------------------------------------------------------------
// Query output type
// ---------------------------------------------------------------------------

export const QueryOutputType = {
  OBJECT_SET: "OBJECT_SET",
  OBJECT: "OBJECT",
  PRIMITIVE: "PRIMITIVE",
  STRUCT: "STRUCT",
  ARRAY: "ARRAY",
  SET: "SET",
  UNION: "UNION",
} as const;

export type QueryOutputType =
  (typeof QueryOutputType)[keyof typeof QueryOutputType];

export interface QueryOutput {
  /** The shape of the query's return value. */
  readonly type: QueryOutputType;

  /**
   * For OBJECT_SET / OBJECT outputs, the apiName of the object type returned.
   */
  readonly objectTypeApiName?: string;

  /** For PRIMITIVE outputs, the property type of the scalar. */
  readonly primitiveType?: PropertyType;

  /** For ARRAY / SET outputs, the element definition. */
  readonly elementOutput?: QueryOutput;

  /** For STRUCT outputs, the field definitions. */
  readonly structFields?: Record<string, QueryOutput>;

  /** For UNION outputs, the possible variants. */
  readonly unionVariants?: readonly QueryOutput[];
}

// ---------------------------------------------------------------------------
// QueryTypeDefinition
// ---------------------------------------------------------------------------

/**
 * Defines a query type in the ontology — a named, versioned read operation
 * that accepts typed parameters and returns a typed result.
 *
 * Queries are the primary way to fetch data from the ontology in a
 * structured, type-safe manner.
 */
export interface QueryTypeDefinition {
  /** Unique API name used to reference this query type programmatically. */
  readonly apiName: string;

  /** Monotonically increasing version for backwards compatibility. */
  readonly version: string;

  /** Human-readable description of what this query does. */
  readonly description: string;

  /** Parameters accepted by this query, keyed by parameter apiName. */
  readonly parameters: Record<string, QueryParameter>;

  /** The typed output definition of this query. */
  readonly output: QueryOutput;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface QueryTypeValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validates a QueryTypeDefinition, returning an array of errors.
 * An empty array indicates a valid definition.
 */
export function validateQueryType(
  def: QueryTypeDefinition,
): QueryTypeValidationError[] {
  const errors: QueryTypeValidationError[] = [];

  if (!def.apiName || def.apiName.trim().length === 0) {
    errors.push({ field: "apiName", message: "apiName must be non-empty" });
  }

  if (!def.version || def.version.trim().length === 0) {
    errors.push({ field: "version", message: "version must be non-empty" });
  }

  if (!def.description || def.description.trim().length === 0) {
    errors.push({
      field: "description",
      message: "description must be non-empty",
    });
  }

  if (!def.output) {
    errors.push({
      field: "output",
      message: "query must define an output type",
    });
  }

  return errors;
}
