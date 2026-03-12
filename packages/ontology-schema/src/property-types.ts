/**
 * All property types supported by the ontology type system.
 *
 * These mirror the 21 property types extracted from Palantir's ontology
 * specification, covering primitives, temporal types, geospatial types,
 * and platform-specific reference types.
 */

// ---------------------------------------------------------------------------
// Property type enumeration
// ---------------------------------------------------------------------------

export const PropertyType = {
  STRING: "STRING",
  BOOLEAN: "BOOLEAN",
  INTEGER: "INTEGER",
  LONG: "LONG",
  DOUBLE: "DOUBLE",
  FLOAT: "FLOAT",
  DECIMAL: "DECIMAL",
  BYTE: "BYTE",
  SHORT: "SHORT",
  DATE: "DATE",
  TIMESTAMP: "TIMESTAMP",
  ATTACHMENT: "ATTACHMENT",
  GEOSHAPE: "GEOSHAPE",
  GEOHASH: "GEOHASH",
  GEOPOINT: "GEOPOINT",
  MARKING: "MARKING",
  VECTOR: "VECTOR",
  TIMESERIES: "TIMESERIES",
  STRUCT: "STRUCT",
  MEDIA_REFERENCE: "MEDIA_REFERENCE",
  RID: "RID",
} as const;

export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

// ---------------------------------------------------------------------------
// Runtime type mapping — maps property type tags to their TypeScript values
// ---------------------------------------------------------------------------

export interface PropertyTypeMap {
  STRING: string;
  BOOLEAN: boolean;
  INTEGER: number;
  LONG: bigint;
  DOUBLE: number;
  FLOAT: number;
  DECIMAL: string; // arbitrary-precision, stored as string
  BYTE: number;
  SHORT: number;
  DATE: string; // ISO-8601 date (YYYY-MM-DD)
  TIMESTAMP: string; // ISO-8601 datetime with timezone
  ATTACHMENT: string; // attachment RID
  GEOSHAPE: GeoJsonGeometry;
  GEOHASH: string;
  GEOPOINT: GeoPoint;
  MARKING: string; // marking RID
  VECTOR: number[];
  TIMESERIES: TimeseriesReference;
  STRUCT: Record<string, unknown>;
  MEDIA_REFERENCE: string; // media item RID
  RID: string; // resource identifier
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeoJsonGeometry {
  readonly type: string;
  readonly coordinates: unknown;
}

export interface TimeseriesReference {
  readonly seriesId: string;
  readonly type: "NUMERIC" | "STRING";
}

// ---------------------------------------------------------------------------
// Multiplicity
// ---------------------------------------------------------------------------

export const Multiplicity = {
  SINGLE: "SINGLE",
  ARRAY: "ARRAY",
  SET: "SET",
} as const;

export type Multiplicity = (typeof Multiplicity)[keyof typeof Multiplicity];

// ---------------------------------------------------------------------------
// PropertyDef — the generic property definition
// ---------------------------------------------------------------------------

/**
 * Defines a single property within an object type.
 *
 * @typeParam TYPE      - The property type tag (e.g. "STRING", "INTEGER").
 * @typeParam NULLABLE  - Whether the property value may be null.
 * @typeParam MULT      - The multiplicity of the property value.
 */
export interface PropertyDef<
  TYPE extends PropertyType = PropertyType,
  NULLABLE extends boolean = boolean,
  MULT extends Multiplicity = Multiplicity,
> {
  /** Human-readable description of this property. */
  readonly description?: string;

  /** The data type of this property. */
  readonly type: TYPE;

  /** Whether this property may be null / absent. */
  readonly nullable: NULLABLE;

  /** Whether the value is singular, an array, or a set. */
  readonly multiplicity: MULT;

  /** For VECTOR type: the fixed dimensionality. */
  readonly vectorDimension?: number;

  /** For STRUCT type: nested property definitions. */
  readonly structFields?: Record<string, PropertyDef>;

  /** For TIMESERIES type: the value type of the series. */
  readonly timeseriesValueType?: "NUMERIC" | "STRING";
}

// ---------------------------------------------------------------------------
// Helpers for constructing property definitions
// ---------------------------------------------------------------------------

export function stringProperty(
  opts: { nullable?: boolean; description?: string } = {},
): PropertyDef<"STRING", boolean, "SINGLE"> {
  return {
    type: PropertyType.STRING,
    nullable: opts.nullable ?? false,
    multiplicity: Multiplicity.SINGLE,
    description: opts.description,
  };
}

export function integerProperty(
  opts: { nullable?: boolean; description?: string } = {},
): PropertyDef<"INTEGER", boolean, "SINGLE"> {
  return {
    type: PropertyType.INTEGER,
    nullable: opts.nullable ?? false,
    multiplicity: Multiplicity.SINGLE,
    description: opts.description,
  };
}

export function booleanProperty(
  opts: { nullable?: boolean; description?: string } = {},
): PropertyDef<"BOOLEAN", boolean, "SINGLE"> {
  return {
    type: PropertyType.BOOLEAN,
    nullable: opts.nullable ?? false,
    multiplicity: Multiplicity.SINGLE,
    description: opts.description,
  };
}

export function timestampProperty(
  opts: { nullable?: boolean; description?: string } = {},
): PropertyDef<"TIMESTAMP", boolean, "SINGLE"> {
  return {
    type: PropertyType.TIMESTAMP,
    nullable: opts.nullable ?? false,
    multiplicity: Multiplicity.SINGLE,
    description: opts.description,
  };
}

export function ridProperty(
  opts: { nullable?: boolean; description?: string } = {},
): PropertyDef<"RID", boolean, "SINGLE"> {
  return {
    type: PropertyType.RID,
    nullable: opts.nullable ?? false,
    multiplicity: Multiplicity.SINGLE,
    description: opts.description,
  };
}

export function arrayProperty<T extends PropertyType>(
  type: T,
  opts: { nullable?: boolean; description?: string } = {},
): PropertyDef<T, boolean, "ARRAY"> {
  return {
    type,
    nullable: opts.nullable ?? false,
    multiplicity: Multiplicity.ARRAY,
    description: opts.description,
  };
}

export function vectorProperty(
  dimension: number,
  opts: { nullable?: boolean; description?: string } = {},
): PropertyDef<"VECTOR", boolean, "SINGLE"> {
  return {
    type: PropertyType.VECTOR,
    nullable: opts.nullable ?? false,
    multiplicity: Multiplicity.SINGLE,
    vectorDimension: dimension,
    description: opts.description,
  };
}
