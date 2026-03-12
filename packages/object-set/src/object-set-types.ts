import type { Filter } from "./filter-types.js";

// ---------------------------------------------------------------------------
// ObjectSet discriminated union — 17 types
// ---------------------------------------------------------------------------

export type ObjectSetType =
  | "BASE"
  | "FILTER"
  | "UNION"
  | "INTERSECT"
  | "SUBTRACT"
  | "SEARCH_AROUND"
  | "STATIC"
  | "REFERENCE"
  | "INTERFACE_BASE"
  | "NEAR"
  | "WITHIN"
  | "INTERSECTS_BBOX"
  | "INTERSECTS_POLYGON"
  | "ALL_GEO"
  | "NATURAL_LANGUAGE"
  | "DATAFRAME"
  | "VERSIONED";

/** Base object set — all objects of a given type. */
export interface BaseObjectSet {
  type: "BASE";
  objectType: string;
}

/** Filtered subset of another object set. */
export interface FilterObjectSet {
  type: "FILTER";
  objectSet: ObjectSet;
  filter: Filter;
}

/** Union of multiple object sets. */
export interface UnionObjectSet {
  type: "UNION";
  objectSets: ObjectSet[];
}

/** Intersection of multiple object sets. */
export interface IntersectObjectSet {
  type: "INTERSECT";
  objectSets: ObjectSet[];
}

/** Set difference: left minus right. */
export interface SubtractObjectSet {
  type: "SUBTRACT";
  objectSets: [ObjectSet, ObjectSet];
}

/** Objects reachable by traversing a link type from a source set. */
export interface SearchAroundObjectSet {
  type: "SEARCH_AROUND";
  objectSet: ObjectSet;
  link: string;
}

/** An explicit set of object primary keys. */
export interface StaticObjectSet {
  type: "STATIC";
  objectType: string;
  primaryKeys: string[];
}

/** Objects reachable through a reference property. */
export interface ReferenceObjectSet {
  type: "REFERENCE";
  objectSet: ObjectSet;
  referenceProperty: string;
}

/** Base set for an interface type (polymorphic). */
export interface InterfaceBaseObjectSet {
  type: "INTERFACE_BASE";
  interfaceType: string;
}

/** Geospatial: objects near a point. */
export interface NearObjectSet {
  type: "NEAR";
  objectSet: ObjectSet;
  property: string;
  center: GeoPoint;
  distanceMeters: number;
}

/** Geospatial: objects within a distance of a point. */
export interface WithinObjectSet {
  type: "WITHIN";
  objectSet: ObjectSet;
  property: string;
  center: GeoPoint;
  distanceMeters: number;
}

/** Geospatial: objects intersecting a bounding box. */
export interface IntersectsBboxObjectSet {
  type: "INTERSECTS_BBOX";
  objectSet: ObjectSet;
  property: string;
  bbox: BoundingBox;
}

/** Geospatial: objects intersecting a polygon. */
export interface IntersectsPolygonObjectSet {
  type: "INTERSECTS_POLYGON";
  objectSet: ObjectSet;
  property: string;
  polygon: GeoPolygon;
}

/** All objects with geospatial data on a property. */
export interface AllGeoObjectSet {
  type: "ALL_GEO";
  objectSet: ObjectSet;
  property: string;
}

/** Natural language query over objects. */
export interface NaturalLanguageObjectSet {
  type: "NATURAL_LANGUAGE";
  objectSet: ObjectSet;
  query: string;
}

/** Objects from a dataframe/dataset source. */
export interface DataframeObjectSet {
  type: "DATAFRAME";
  dataframeRid: string;
  objectType: string;
}

/** A versioned snapshot of an object set. */
export interface VersionedObjectSet {
  type: "VERSIONED";
  objectSet: ObjectSet;
  version: string;
}

/**
 * Discriminated union of all 17 ObjectSet types.
 */
export type ObjectSet =
  | BaseObjectSet
  | FilterObjectSet
  | UnionObjectSet
  | IntersectObjectSet
  | SubtractObjectSet
  | SearchAroundObjectSet
  | StaticObjectSet
  | ReferenceObjectSet
  | InterfaceBaseObjectSet
  | NearObjectSet
  | WithinObjectSet
  | IntersectsBboxObjectSet
  | IntersectsPolygonObjectSet
  | AllGeoObjectSet
  | NaturalLanguageObjectSet
  | DataframeObjectSet
  | VersionedObjectSet;

// ---------------------------------------------------------------------------
// Shared geo types
// ---------------------------------------------------------------------------

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  topLeft: GeoPoint;
  bottomRight: GeoPoint;
}

export interface GeoPolygon {
  coordinates: GeoPoint[];
}
