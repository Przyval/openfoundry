import { describe, it, expect } from "vitest";
import {
  objectSet,
  staticObjectSet,
  interfaceObjectSet,
  dataframeObjectSet,
  eq,
  contains,
  startsWith,
  gt,
  gte,
  lt,
  lte,
  isNull,
  range,
  inSet,
  hasProperty,
  phrase,
  prefix,
  regex,
  and,
  or,
  not,
  geoBoundingBox,
  geoDistance,
  geoPolygon,
  relativeTimeRange,
  absoluteTimeRange,
  structField,
  arrayContains,
  arrayContainsAll,
  arrayIsEmpty,
  count,
  min,
  max,
  sum,
  avg,
  approximateDistinct,
  exactDistinct,
  approximatePercentile,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// ObjectSet builder
// ---------------------------------------------------------------------------

describe("ObjectSetBuilder", () => {
  it("creates a base object set", () => {
    const os = objectSet("Employee").build();
    expect(os).toEqual({ type: "BASE", objectType: "Employee" });
  });

  it("applies a filter", () => {
    const os = objectSet("Employee").filter(eq("name", "John")).build();
    expect(os).toEqual({
      type: "FILTER",
      objectSet: { type: "BASE", objectType: "Employee" },
      filter: { type: "EQUALS", property: "name", value: "John" },
    });
  });

  it("chains multiple filters", () => {
    const os = objectSet("Employee")
      .filter(eq("department", "Engineering"))
      .filter(gt("salary", 100000))
      .build();

    expect(os.type).toBe("FILTER");
    if (os.type === "FILTER") {
      expect(os.filter).toEqual({ type: "GT", property: "salary", value: 100000 });
      expect(os.objectSet.type).toBe("FILTER");
    }
  });

  it("creates a union of two object sets", () => {
    const employees = objectSet("Employee");
    const contractors = objectSet("Contractor");

    const os = employees.union(contractors).build();

    expect(os.type).toBe("UNION");
    if (os.type === "UNION") {
      expect(os.objectSets).toHaveLength(2);
      expect(os.objectSets[0]).toEqual({ type: "BASE", objectType: "Employee" });
      expect(os.objectSets[1]).toEqual({ type: "BASE", objectType: "Contractor" });
    }
  });

  it("creates an intersection of object sets", () => {
    const set1 = objectSet("Employee").filter(eq("department", "Engineering"));
    const set2 = objectSet("Employee").filter(gt("salary", 100000));

    const os = set1.intersect(set2).build();
    expect(os.type).toBe("INTERSECT");
    if (os.type === "INTERSECT") {
      expect(os.objectSets).toHaveLength(2);
    }
  });

  it("subtracts one object set from another", () => {
    const all = objectSet("Employee");
    const terminated = objectSet("Employee").filter(eq("status", "terminated"));

    const os = all.subtract(terminated).build();
    expect(os.type).toBe("SUBTRACT");
    if (os.type === "SUBTRACT") {
      expect(os.objectSets[0]).toEqual({ type: "BASE", objectType: "Employee" });
      expect(os.objectSets[1].type).toBe("FILTER");
    }
  });

  it("traverses links with searchAround", () => {
    const os = objectSet("Employee")
      .filter(eq("name", "John"))
      .searchAround("manages")
      .build();

    expect(os.type).toBe("SEARCH_AROUND");
    if (os.type === "SEARCH_AROUND") {
      expect(os.link).toBe("manages");
      expect(os.objectSet.type).toBe("FILTER");
    }
  });

  it("follows references", () => {
    const os = objectSet("Employee").reference("department").build();
    expect(os.type).toBe("REFERENCE");
    if (os.type === "REFERENCE") {
      expect(os.referenceProperty).toBe("department");
    }
  });

  it("creates a static object set", () => {
    const os = staticObjectSet("Employee", ["pk1", "pk2", "pk3"]).build();
    expect(os).toEqual({
      type: "STATIC",
      objectType: "Employee",
      primaryKeys: ["pk1", "pk2", "pk3"],
    });
  });

  it("creates an interface-based object set", () => {
    const os = interfaceObjectSet("IAsset").build();
    expect(os).toEqual({ type: "INTERFACE_BASE", interfaceType: "IAsset" });
  });

  it("creates a dataframe object set", () => {
    const os = dataframeObjectSet("ri.foundry.main.dataset.abc", "DataRow").build();
    expect(os).toEqual({
      type: "DATAFRAME",
      dataframeRid: "ri.foundry.main.dataset.abc",
      objectType: "DataRow",
    });
  });

  it("creates a versioned object set", () => {
    const os = objectSet("Employee").versioned("v2").build();
    expect(os.type).toBe("VERSIONED");
    if (os.type === "VERSIONED") {
      expect(os.version).toBe("v2");
    }
  });

  it("creates geospatial object sets", () => {
    const center = { latitude: 40.7128, longitude: -74.006 };

    const near = objectSet("Store").near("location", center, 5000).build();
    expect(near.type).toBe("NEAR");

    const within = objectSet("Store").within("location", center, 10000).build();
    expect(within.type).toBe("WITHIN");

    const bbox = objectSet("Store").intersectsBbox("location", {
      topLeft: { latitude: 41, longitude: -75 },
      bottomRight: { latitude: 40, longitude: -73 },
    }).build();
    expect(bbox.type).toBe("INTERSECTS_BBOX");

    const polygon = objectSet("Store").intersectsPolygon("location", {
      coordinates: [
        { latitude: 40, longitude: -74 },
        { latitude: 41, longitude: -74 },
        { latitude: 41, longitude: -73 },
        { latitude: 40, longitude: -73 },
      ],
    }).build();
    expect(polygon.type).toBe("INTERSECTS_POLYGON");

    const allGeo = objectSet("Store").allGeo("location").build();
    expect(allGeo.type).toBe("ALL_GEO");
  });

  it("creates a natural language object set", () => {
    const os = objectSet("Employee")
      .naturalLanguage("engineers who joined this year")
      .build();
    expect(os.type).toBe("NATURAL_LANGUAGE");
    if (os.type === "NATURAL_LANGUAGE") {
      expect(os.query).toBe("engineers who joined this year");
    }
  });

  it("supports complex chained queries", () => {
    const managers = objectSet("Employee")
      .filter(and(
        eq("department", "Engineering"),
        gt("salary", 150000),
        not(eq("status", "terminated")),
      ))
      .searchAround("manages");

    const reports = managers
      .filter(gte("performanceRating", 4))
      .build();

    expect(reports.type).toBe("FILTER");
    if (reports.type === "FILTER") {
      expect(reports.objectSet.type).toBe("SEARCH_AROUND");
    }
  });
});

// ---------------------------------------------------------------------------
// Filter factory functions
// ---------------------------------------------------------------------------

describe("Filter factories", () => {
  it("creates comparison filters", () => {
    expect(eq("name", "John")).toEqual({ type: "EQUALS", property: "name", value: "John" });
    expect(contains("name", "oh")).toEqual({ type: "CONTAINS", property: "name", value: "oh" });
    expect(startsWith("name", "J")).toEqual({ type: "STARTS_WITH", property: "name", value: "J" });
    expect(gt("age", 30)).toEqual({ type: "GT", property: "age", value: 30 });
    expect(gte("age", 30)).toEqual({ type: "GTE", property: "age", value: 30 });
    expect(lt("age", 60)).toEqual({ type: "LT", property: "age", value: 60 });
    expect(lte("age", 60)).toEqual({ type: "LTE", property: "age", value: 60 });
  });

  it("creates null/property existence filters", () => {
    expect(isNull("email")).toEqual({ type: "IS_NULL", property: "email" });
    expect(hasProperty("phone")).toEqual({ type: "HAS_PROPERTY", property: "phone" });
  });

  it("creates range filter", () => {
    expect(range("age", { gte: 18, lt: 65 })).toEqual({
      type: "RANGE",
      property: "age",
      gte: 18,
      lt: 65,
    });
  });

  it("creates in-set filter", () => {
    expect(inSet("status", ["active", "pending"])).toEqual({
      type: "IN_SET",
      property: "status",
      values: ["active", "pending"],
    });
  });

  it("creates full-text search filters", () => {
    expect(phrase("bio", "software engineer")).toEqual({
      type: "PHRASE", property: "bio", value: "software engineer",
    });
    expect(prefix("name", "Jo")).toEqual({
      type: "PREFIX", property: "name", value: "Jo",
    });
    expect(regex("email", ".*@example\\.com")).toEqual({
      type: "REGEX", property: "email", pattern: ".*@example\\.com",
    });
  });

  it("creates logical combinators", () => {
    const f = and(eq("a", 1), or(eq("b", 2), eq("c", 3)));
    expect(f.type).toBe("AND");
    if (f.type === "AND") {
      expect(f.filters).toHaveLength(2);
      expect(f.filters[1].type).toBe("OR");
    }
  });

  it("creates NOT filter", () => {
    const f = not(eq("deleted", true));
    expect(f).toEqual({
      type: "NOT",
      filter: { type: "EQUALS", property: "deleted", value: true },
    });
  });

  it("creates geospatial filters", () => {
    const bbox = geoBoundingBox(
      "location",
      { latitude: 41, longitude: -75 },
      { latitude: 40, longitude: -73 },
    );
    expect(bbox.type).toBe("GEO_BOUNDING_BOX");

    const dist = geoDistance("location", { latitude: 40.7, longitude: -74 }, 5000);
    expect(dist.type).toBe("GEO_DISTANCE");

    const poly = geoPolygon("location", [
      { latitude: 40, longitude: -74 },
      { latitude: 41, longitude: -74 },
      { latitude: 41, longitude: -73 },
    ]);
    expect(poly.type).toBe("GEO_POLYGON");
  });

  it("creates time range filters", () => {
    const relative = relativeTimeRange("createdAt", 7, "DAYS", "PAST");
    expect(relative).toEqual({
      type: "RELATIVE_TIME_RANGE",
      property: "createdAt",
      value: 7,
      unit: "DAYS",
      direction: "PAST",
    });

    const absolute = absoluteTimeRange("createdAt", {
      startTime: "2024-01-01T00:00:00Z",
      endTime: "2024-12-31T23:59:59Z",
    });
    expect(absolute).toEqual({
      type: "ABSOLUTE_TIME_RANGE",
      property: "createdAt",
      startTime: "2024-01-01T00:00:00Z",
      endTime: "2024-12-31T23:59:59Z",
    });
  });

  it("creates struct and array filters", () => {
    const sf = structField("address", "city", eq("city", "NYC"));
    expect(sf.type).toBe("STRUCT_FIELD");

    expect(arrayContains("tags", "urgent")).toEqual({
      type: "ARRAY_CONTAINS", property: "tags", value: "urgent",
    });
    expect(arrayContainsAll("tags", ["urgent", "high"])).toEqual({
      type: "ARRAY_CONTAINS_ALL", property: "tags", values: ["urgent", "high"],
    });
    expect(arrayIsEmpty("tags")).toEqual({
      type: "ARRAY_IS_EMPTY", property: "tags",
    });
  });
});

// ---------------------------------------------------------------------------
// Aggregation factories
// ---------------------------------------------------------------------------

describe("Aggregation factories", () => {
  it("creates all aggregation types", () => {
    expect(count()).toEqual({ type: "COUNT" });
    expect(min("salary")).toEqual({ type: "MIN", property: "salary" });
    expect(max("salary")).toEqual({ type: "MAX", property: "salary" });
    expect(sum("salary")).toEqual({ type: "SUM", property: "salary" });
    expect(avg("salary")).toEqual({ type: "AVG", property: "salary" });
    expect(approximateDistinct("department")).toEqual({
      type: "APPROXIMATE_DISTINCT", property: "department",
    });
    expect(exactDistinct("department")).toEqual({
      type: "EXACT_DISTINCT", property: "department",
    });
    expect(approximatePercentile("salary", 0.95)).toEqual({
      type: "APPROXIMATE_PERCENTILE", property: "salary", percentile: 0.95,
    });
  });

  it("validates percentile range", () => {
    expect(() => approximatePercentile("salary", -0.1)).toThrow(RangeError);
    expect(() => approximatePercentile("salary", 1.1)).toThrow(RangeError);
    expect(() => approximatePercentile("salary", 0.5)).not.toThrow();
  });
});
