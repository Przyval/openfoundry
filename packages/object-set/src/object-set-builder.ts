import type {
  ObjectSet,
  GeoPoint,
  BoundingBox,
  GeoPolygon,
} from "./object-set-types.js";
import type {
  Filter,
  PropertyValue,
  GeoCoordinate,
  TimeUnit,
} from "./filter-types.js";

// ---------------------------------------------------------------------------
// Filter factory functions
// ---------------------------------------------------------------------------

export function eq(property: string, value: PropertyValue): Filter {
  return { type: "EQUALS", property, value };
}

export function contains(property: string, value: string): Filter {
  return { type: "CONTAINS", property, value };
}

export function startsWith(property: string, value: string): Filter {
  return { type: "STARTS_WITH", property, value };
}

export function gt(property: string, value: PropertyValue): Filter {
  return { type: "GT", property, value };
}

export function gte(property: string, value: PropertyValue): Filter {
  return { type: "GTE", property, value };
}

export function lt(property: string, value: PropertyValue): Filter {
  return { type: "LT", property, value };
}

export function lte(property: string, value: PropertyValue): Filter {
  return { type: "LTE", property, value };
}

export function isNull(property: string): Filter {
  return { type: "IS_NULL", property };
}

export function range(
  property: string,
  bounds: { gte?: PropertyValue; gt?: PropertyValue; lte?: PropertyValue; lt?: PropertyValue },
): Filter {
  return { type: "RANGE", property, ...bounds };
}

export function inSet(property: string, values: PropertyValue[]): Filter {
  return { type: "IN_SET", property, values };
}

export function hasProperty(property: string): Filter {
  return { type: "HAS_PROPERTY", property };
}

export function phrase(property: string, value: string): Filter {
  return { type: "PHRASE", property, value };
}

export function prefix(property: string, value: string): Filter {
  return { type: "PREFIX", property, value };
}

export function regex(property: string, pattern: string): Filter {
  return { type: "REGEX", property, pattern };
}

export function and(...filters: Filter[]): Filter {
  return { type: "AND", filters };
}

export function or(...filters: Filter[]): Filter {
  return { type: "OR", filters };
}

export function not(filter: Filter): Filter {
  return { type: "NOT", filter };
}

export function geoBoundingBox(
  property: string,
  topLeft: GeoCoordinate,
  bottomRight: GeoCoordinate,
): Filter {
  return { type: "GEO_BOUNDING_BOX", property, topLeft, bottomRight };
}

export function geoDistance(
  property: string,
  center: GeoCoordinate,
  distanceMeters: number,
): Filter {
  return { type: "GEO_DISTANCE", property, center, distanceMeters };
}

export function geoPolygon(property: string, coordinates: GeoCoordinate[]): Filter {
  return { type: "GEO_POLYGON", property, coordinates };
}

export function relativeTimeRange(
  property: string,
  value: number,
  unit: TimeUnit,
  direction: "PAST" | "FUTURE",
): Filter {
  return { type: "RELATIVE_TIME_RANGE", property, value, unit, direction };
}

export function absoluteTimeRange(
  property: string,
  options: { startTime?: string; endTime?: string },
): Filter {
  return { type: "ABSOLUTE_TIME_RANGE", property, ...options };
}

export function structField(property: string, fieldName: string, filter: Filter): Filter {
  return { type: "STRUCT_FIELD", property, fieldName, filter };
}

export function arrayContains(property: string, value: PropertyValue): Filter {
  return { type: "ARRAY_CONTAINS", property, value };
}

export function arrayContainsAll(property: string, values: PropertyValue[]): Filter {
  return { type: "ARRAY_CONTAINS_ALL", property, values };
}

export function arrayIsEmpty(property: string): Filter {
  return { type: "ARRAY_IS_EMPTY", property };
}

// ---------------------------------------------------------------------------
// ObjectSetBuilder — fluent API
// ---------------------------------------------------------------------------

/**
 * Fluent builder for constructing ObjectSet query definitions.
 *
 * Usage:
 * ```ts
 * const result = objectSet("Employee")
 *   .filter(eq("name", "John"))
 *   .union(objectSet("Contractor"))
 *   .searchAround("manages")
 *   .build();
 * ```
 */
export class ObjectSetBuilder {
  private _objectSet: ObjectSet;

  constructor(objectSet: ObjectSet) {
    this._objectSet = objectSet;
  }

  /**
   * Applies a filter to this object set.
   */
  filter(filter: Filter): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "FILTER",
      objectSet: this._objectSet,
      filter,
    });
  }

  /**
   * Creates a union of this object set with one or more other sets.
   */
  union(...others: (ObjectSetBuilder | ObjectSet)[]): ObjectSetBuilder {
    const otherSets = others.map((o) => o instanceof ObjectSetBuilder ? o.build() : o);
    return new ObjectSetBuilder({
      type: "UNION",
      objectSets: [this._objectSet, ...otherSets],
    });
  }

  /**
   * Creates an intersection of this object set with one or more other sets.
   */
  intersect(...others: (ObjectSetBuilder | ObjectSet)[]): ObjectSetBuilder {
    const otherSets = others.map((o) => o instanceof ObjectSetBuilder ? o.build() : o);
    return new ObjectSetBuilder({
      type: "INTERSECT",
      objectSets: [this._objectSet, ...otherSets],
    });
  }

  /**
   * Subtracts another object set from this one.
   */
  subtract(other: ObjectSetBuilder | ObjectSet): ObjectSetBuilder {
    const otherSet = other instanceof ObjectSetBuilder ? other.build() : other;
    return new ObjectSetBuilder({
      type: "SUBTRACT",
      objectSets: [this._objectSet, otherSet],
    });
  }

  /**
   * Traverses a link type to find related objects.
   */
  searchAround(link: string): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "SEARCH_AROUND",
      objectSet: this._objectSet,
      link,
    });
  }

  /**
   * Follows a reference property to find related objects.
   */
  reference(referenceProperty: string): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "REFERENCE",
      objectSet: this._objectSet,
      referenceProperty,
    });
  }

  /**
   * Finds objects near a geographic point.
   */
  near(property: string, center: GeoPoint, distanceMeters: number): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "NEAR",
      objectSet: this._objectSet,
      property,
      center,
      distanceMeters,
    });
  }

  /**
   * Finds objects within a distance of a geographic point.
   */
  within(property: string, center: GeoPoint, distanceMeters: number): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "WITHIN",
      objectSet: this._objectSet,
      property,
      center,
      distanceMeters,
    });
  }

  /**
   * Finds objects intersecting a bounding box.
   */
  intersectsBbox(property: string, bbox: BoundingBox): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "INTERSECTS_BBOX",
      objectSet: this._objectSet,
      property,
      bbox,
    });
  }

  /**
   * Finds objects intersecting a polygon.
   */
  intersectsPolygon(property: string, polygon: GeoPolygon): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "INTERSECTS_POLYGON",
      objectSet: this._objectSet,
      property,
      polygon,
    });
  }

  /**
   * Finds all objects with geospatial data on a property.
   */
  allGeo(property: string): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "ALL_GEO",
      objectSet: this._objectSet,
      property,
    });
  }

  /**
   * Queries objects using natural language.
   */
  naturalLanguage(query: string): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "NATURAL_LANGUAGE",
      objectSet: this._objectSet,
      query,
    });
  }

  /**
   * Pins the object set to a specific version.
   */
  versioned(version: string): ObjectSetBuilder {
    return new ObjectSetBuilder({
      type: "VERSIONED",
      objectSet: this._objectSet,
      version,
    });
  }

  /**
   * Returns the constructed ObjectSet definition.
   */
  build(): ObjectSet {
    return this._objectSet;
  }
}

// ---------------------------------------------------------------------------
// Entry point functions
// ---------------------------------------------------------------------------

/**
 * Creates a base object set for the given object type.
 *
 * ```ts
 * objectSet("Employee").filter(eq("name", "John")).build()
 * ```
 */
export function objectSet(objectType: string): ObjectSetBuilder {
  return new ObjectSetBuilder({ type: "BASE", objectType });
}

/**
 * Creates a static object set from explicit primary keys.
 */
export function staticObjectSet(objectType: string, primaryKeys: string[]): ObjectSetBuilder {
  return new ObjectSetBuilder({ type: "STATIC", objectType, primaryKeys });
}

/**
 * Creates a base object set for an interface type.
 */
export function interfaceObjectSet(interfaceType: string): ObjectSetBuilder {
  return new ObjectSetBuilder({ type: "INTERFACE_BASE", interfaceType });
}

/**
 * Creates an object set sourced from a dataframe.
 */
export function dataframeObjectSet(dataframeRid: string, objectType: string): ObjectSetBuilder {
  return new ObjectSetBuilder({ type: "DATAFRAME", dataframeRid, objectType });
}
