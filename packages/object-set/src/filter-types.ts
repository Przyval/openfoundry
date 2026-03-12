// ---------------------------------------------------------------------------
// Filter discriminated union — 27 types
// ---------------------------------------------------------------------------

export type FilterType =
  | "AND"
  | "OR"
  | "NOT"
  | "EQUALS"
  | "CONTAINS"
  | "STARTS_WITH"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "IS_NULL"
  | "RANGE"
  | "IN_SET"
  | "HAS_PROPERTY"
  | "PHRASE"
  | "PREFIX"
  | "REGEX"
  | "GEO_BOUNDING_BOX"
  | "GEO_DISTANCE"
  | "GEO_POLYGON"
  | "GEO_SHAPE"
  | "RELATIVE_TIME_RANGE"
  | "ABSOLUTE_TIME_RANGE"
  | "STRUCT_FIELD"
  | "ARRAY_CONTAINS"
  | "ARRAY_CONTAINS_ALL"
  | "ARRAY_IS_EMPTY";

// ---------------------------------------------------------------------------
// Logical combinators
// ---------------------------------------------------------------------------

export interface AndFilter {
  type: "AND";
  filters: Filter[];
}

export interface OrFilter {
  type: "OR";
  filters: Filter[];
}

export interface NotFilter {
  type: "NOT";
  filter: Filter;
}

// ---------------------------------------------------------------------------
// Comparison filters
// ---------------------------------------------------------------------------

export interface EqualsFilter {
  type: "EQUALS";
  property: string;
  value: PropertyValue;
}

export interface ContainsFilter {
  type: "CONTAINS";
  property: string;
  value: string;
}

export interface StartsWithFilter {
  type: "STARTS_WITH";
  property: string;
  value: string;
}

export interface GtFilter {
  type: "GT";
  property: string;
  value: PropertyValue;
}

export interface GteFilter {
  type: "GTE";
  property: string;
  value: PropertyValue;
}

export interface LtFilter {
  type: "LT";
  property: string;
  value: PropertyValue;
}

export interface LteFilter {
  type: "LTE";
  property: string;
  value: PropertyValue;
}

export interface IsNullFilter {
  type: "IS_NULL";
  property: string;
}

export interface RangeFilter {
  type: "RANGE";
  property: string;
  gte?: PropertyValue;
  gt?: PropertyValue;
  lte?: PropertyValue;
  lt?: PropertyValue;
}

export interface InSetFilter {
  type: "IN_SET";
  property: string;
  values: PropertyValue[];
}

export interface HasPropertyFilter {
  type: "HAS_PROPERTY";
  property: string;
}

// ---------------------------------------------------------------------------
// Full-text search filters
// ---------------------------------------------------------------------------

export interface PhraseFilter {
  type: "PHRASE";
  property: string;
  value: string;
}

export interface PrefixFilter {
  type: "PREFIX";
  property: string;
  value: string;
}

export interface RegexFilter {
  type: "REGEX";
  property: string;
  pattern: string;
}

// ---------------------------------------------------------------------------
// Geospatial filters
// ---------------------------------------------------------------------------

export interface GeoBoundingBoxFilter {
  type: "GEO_BOUNDING_BOX";
  property: string;
  topLeft: GeoCoordinate;
  bottomRight: GeoCoordinate;
}

export interface GeoDistanceFilter {
  type: "GEO_DISTANCE";
  property: string;
  center: GeoCoordinate;
  distanceMeters: number;
}

export interface GeoPolygonFilter {
  type: "GEO_POLYGON";
  property: string;
  coordinates: GeoCoordinate[];
}

export interface GeoShapeFilter {
  type: "GEO_SHAPE";
  property: string;
  geometry: GeoJsonGeometry;
  relation: GeoShapeRelation;
}

// ---------------------------------------------------------------------------
// Time range filters
// ---------------------------------------------------------------------------

export interface RelativeTimeRangeFilter {
  type: "RELATIVE_TIME_RANGE";
  property: string;
  value: number;
  unit: TimeUnit;
  direction: "PAST" | "FUTURE";
}

export interface AbsoluteTimeRangeFilter {
  type: "ABSOLUTE_TIME_RANGE";
  property: string;
  startTime?: string;
  endTime?: string;
}

// ---------------------------------------------------------------------------
// Struct and array filters
// ---------------------------------------------------------------------------

export interface StructFieldFilter {
  type: "STRUCT_FIELD";
  property: string;
  fieldName: string;
  filter: Filter;
}

export interface ArrayContainsFilter {
  type: "ARRAY_CONTAINS";
  property: string;
  value: PropertyValue;
}

export interface ArrayContainsAllFilter {
  type: "ARRAY_CONTAINS_ALL";
  property: string;
  values: PropertyValue[];
}

export interface ArrayIsEmptyFilter {
  type: "ARRAY_IS_EMPTY";
  property: string;
}

// ---------------------------------------------------------------------------
// Discriminated union of all 27 filter types
// ---------------------------------------------------------------------------

export type Filter =
  | AndFilter
  | OrFilter
  | NotFilter
  | EqualsFilter
  | ContainsFilter
  | StartsWithFilter
  | GtFilter
  | GteFilter
  | LtFilter
  | LteFilter
  | IsNullFilter
  | RangeFilter
  | InSetFilter
  | HasPropertyFilter
  | PhraseFilter
  | PrefixFilter
  | RegexFilter
  | GeoBoundingBoxFilter
  | GeoDistanceFilter
  | GeoPolygonFilter
  | GeoShapeFilter
  | RelativeTimeRangeFilter
  | AbsoluteTimeRangeFilter
  | StructFieldFilter
  | ArrayContainsFilter
  | ArrayContainsAllFilter
  | ArrayIsEmptyFilter;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** A property value that can be used in comparisons. */
export type PropertyValue = string | number | boolean;

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export type GeoShapeRelation = "INTERSECTS" | "CONTAINS" | "WITHIN" | "DISJOINT";

export type TimeUnit = "SECONDS" | "MINUTES" | "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
