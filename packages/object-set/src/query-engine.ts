import type { Filter, PropertyValue } from "./filter-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A simplified object-set definition that uses the "API wire format" style
 * (lowercase type strings like "base", "filter") in addition to the canonical
 * uppercase forms used internally.  The query engine normalises both.
 */
export interface ObjectSetDefinition {
  type: string;
  objectType?: string;
  objectSet?: ObjectSetDefinition;
  objectSets?: ObjectSetDefinition[];
  where?: WhereClause;
  filter?: Filter;
  primaryKeys?: string[];
  link?: string;
}

export interface WhereClause {
  type: string;
  field?: string;
  value?: unknown;
  values?: unknown[];
  filter?: WhereClause;
  property?: string;
}

export interface AggregationDef {
  type: string;
  field?: string;
  name?: string;
  property?: string;
}

export interface GroupByDef {
  field: string;
  type: string; // "exact" | "ranges" | "fixedWidth" etc.
}

export interface AggregationResult {
  group: Record<string, unknown>;
  metrics: Record<string, number>;
}

export interface SearchOptions {
  query: string;
  fields?: string[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  pageSize?: number;
  pageToken?: string;
}

// ---------------------------------------------------------------------------
// ObjectSetQueryEngine
// ---------------------------------------------------------------------------

/**
 * Evaluates ObjectSet definitions, filters, aggregations, and search queries
 * against in-memory arrays of objects.  This engine is designed to work both
 * as a standalone unit-testable module and as the evaluation core backing the
 * svc-objects HTTP routes.
 */
export class ObjectSetQueryEngine {
  // -------------------------------------------------------------------------
  // ObjectSet evaluation
  // -------------------------------------------------------------------------

  /**
   * Resolves an ObjectSetDefinition to a filtered array of objects.
   * The `allObjects` callback is used to fetch all objects of a given type.
   */
  evaluate(
    objects: Record<string, unknown>[],
    definition: ObjectSetDefinition,
  ): Record<string, unknown>[] {
    const t = definition.type.toUpperCase();

    switch (t) {
      case "BASE":
        // When we have a pre-resolved set, filter by objectType if present
        if (definition.objectType) {
          return objects.filter(
            (obj) => obj.objectType === definition.objectType,
          );
        }
        return objects;

      case "FILTER": {
        const source = definition.objectSet
          ? this.evaluate(objects, definition.objectSet)
          : objects;

        // Support both "where" (API wire format) and "filter" (internal format)
        if (definition.where) {
          return source.filter((obj) => this.evaluateWhere(obj, definition.where!));
        }
        if (definition.filter) {
          return source.filter((obj) => this.evaluateCanonicalFilter(obj, definition.filter!));
        }
        return source;
      }

      case "UNION": {
        if (!definition.objectSets) return objects;
        const seen = new Set<string>();
        const result: Record<string, unknown>[] = [];
        for (const setDef of definition.objectSets) {
          for (const obj of this.evaluate(objects, setDef)) {
            const key = objKey(obj);
            if (!seen.has(key)) {
              seen.add(key);
              result.push(obj);
            }
          }
        }
        return result;
      }

      case "INTERSECT": {
        if (!definition.objectSets || definition.objectSets.length === 0)
          return [];
        const sets = definition.objectSets.map((s) =>
          this.evaluate(objects, s),
        );
        const keySets = sets.map(
          (s) => new Set(s.map((o) => objKey(o))),
        );
        return sets[0].filter((obj) =>
          keySets.every((ks) => ks.has(objKey(obj))),
        );
      }

      case "SUBTRACT": {
        if (!definition.objectSets || definition.objectSets.length < 2)
          return objects;
        const [leftDef, rightDef] = definition.objectSets;
        const left = this.evaluate(objects, leftDef);
        const rightKeys = new Set(
          this.evaluate(objects, rightDef).map((o) => objKey(o)),
        );
        return left.filter((obj) => !rightKeys.has(objKey(obj)));
      }

      case "STATIC": {
        if (!definition.primaryKeys) return [];
        const keySet = new Set(definition.primaryKeys);
        return objects.filter(
          (obj) =>
            keySet.has(String(obj.primaryKey ?? "")) &&
            (!definition.objectType || obj.objectType === definition.objectType),
        );
      }

      default:
        return objects;
    }
  }

  // -------------------------------------------------------------------------
  // Where clause evaluation (API wire format)
  // -------------------------------------------------------------------------

  evaluateWhere(obj: Record<string, unknown>, where: WhereClause): boolean {
    const t = where.type.toLowerCase();
    const field = where.field ?? where.property;
    const props = (obj.properties ?? obj) as Record<string, unknown>;

    switch (t) {
      case "eq":
        return props[field!] === where.value;

      case "neq":
        return props[field!] !== where.value;

      case "gt":
        return compareValues(props[field!], where.value) > 0;

      case "gte":
        return compareValues(props[field!], where.value) >= 0;

      case "lt":
        return compareValues(props[field!], where.value) < 0;

      case "lte":
        return compareValues(props[field!], where.value) <= 0;

      case "contains": {
        const val = props[field!];
        return typeof val === "string" && val.includes(String(where.value));
      }

      case "startswith":
      case "starts_with": {
        const val = props[field!];
        return typeof val === "string" && val.startsWith(String(where.value));
      }

      case "endswith":
      case "ends_with": {
        const val = props[field!];
        return typeof val === "string" && val.endsWith(String(where.value));
      }

      case "isnull":
      case "is_null":
        return props[field!] === null || props[field!] === undefined;

      case "in": {
        const val = props[field!];
        const values = (where.values ?? where.value) as unknown[];
        return Array.isArray(values) && values.includes(val);
      }

      case "and": {
        const clauses = (where as unknown as { value: WhereClause[] }).value;
        if (!Array.isArray(clauses)) return true;
        return clauses.every((c) => this.evaluateWhere(obj, c));
      }

      case "or": {
        const clauses = (where as unknown as { value: WhereClause[] }).value;
        if (!Array.isArray(clauses)) return true;
        return clauses.some((c) => this.evaluateWhere(obj, c));
      }

      case "not": {
        const inner = where.filter ?? (where as unknown as { value: WhereClause }).value;
        if (!inner) return true;
        return !this.evaluateWhere(obj, inner);
      }

      default:
        return true;
    }
  }

  // -------------------------------------------------------------------------
  // Canonical filter evaluation (internal uppercase format)
  // -------------------------------------------------------------------------

  private evaluateCanonicalFilter(
    obj: Record<string, unknown>,
    filter: Filter,
  ): boolean {
    const props = (obj.properties ?? obj) as Record<string, unknown>;

    switch (filter.type) {
      case "AND":
        return filter.filters.every((f) => this.evaluateCanonicalFilter(obj, f));
      case "OR":
        return filter.filters.some((f) => this.evaluateCanonicalFilter(obj, f));
      case "NOT":
        return !this.evaluateCanonicalFilter(obj, filter.filter);
      case "EQUALS":
        return props[filter.property] === filter.value;
      case "CONTAINS": {
        const val = props[filter.property];
        return typeof val === "string" && val.includes(filter.value);
      }
      case "STARTS_WITH": {
        const val = props[filter.property];
        return typeof val === "string" && val.startsWith(filter.value);
      }
      case "GT":
        return compareValues(props[filter.property], filter.value) > 0;
      case "GTE":
        return compareValues(props[filter.property], filter.value) >= 0;
      case "LT":
        return compareValues(props[filter.property], filter.value) < 0;
      case "LTE":
        return compareValues(props[filter.property], filter.value) <= 0;
      case "IS_NULL":
        return props[filter.property] === null || props[filter.property] === undefined;
      case "HAS_PROPERTY":
        return props[filter.property] !== null && props[filter.property] !== undefined;
      case "IN_SET": {
        const val = props[filter.property];
        return filter.values.includes(val as PropertyValue);
      }
      case "RANGE": {
        const val = props[filter.property] as number;
        if (typeof val !== "number") return false;
        if (filter.gt !== undefined && val <= (filter.gt as number)) return false;
        if (filter.gte !== undefined && val < (filter.gte as number)) return false;
        if (filter.lt !== undefined && val >= (filter.lt as number)) return false;
        if (filter.lte !== undefined && val > (filter.lte as number)) return false;
        return true;
      }
      default:
        return true;
    }
  }

  // -------------------------------------------------------------------------
  // Aggregation
  // -------------------------------------------------------------------------

  aggregate(
    objects: Record<string, unknown>[],
    aggregations: AggregationDef[],
    groupBy?: GroupByDef[],
  ): AggregationResult[] {
    if (groupBy && groupBy.length > 0) {
      const groups = new Map<string, Record<string, unknown>[]>();

      for (const obj of objects) {
        const props = (obj.properties ?? obj) as Record<string, unknown>;
        const key = groupBy
          .map((g) => String(props[g.field] ?? "__null__"))
          .join("|");
        const group = groups.get(key) ?? [];
        group.push(obj);
        groups.set(key, group);
      }

      const results: AggregationResult[] = [];
      for (const [, groupObjects] of groups) {
        const firstProps = (groupObjects[0].properties ?? groupObjects[0]) as Record<string, unknown>;
        const group: Record<string, unknown> = {};
        for (const g of groupBy) {
          group[g.field] = firstProps[g.field];
        }
        const metrics = this.computeMetrics(groupObjects, aggregations);
        results.push({ group, metrics });
      }
      return results;
    }

    // No groupBy: single result
    const metrics = this.computeMetrics(objects, aggregations);
    return [{ group: {}, metrics }];
  }

  private computeMetrics(
    objects: Record<string, unknown>[],
    aggregations: AggregationDef[],
  ): Record<string, number> {
    const metrics: Record<string, number> = {};

    for (const agg of aggregations) {
      const name = agg.name ?? agg.type;
      const field = agg.field ?? agg.property;
      const t = agg.type.toLowerCase();

      switch (t) {
        case "count":
          metrics[name] = objects.length;
          break;

        case "sum": {
          const nums = extractNums(objects, field!);
          metrics[name] = nums.reduce((a, b) => a + b, 0);
          break;
        }

        case "avg": {
          const nums = extractNums(objects, field!);
          metrics[name] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          break;
        }

        case "min": {
          const nums = extractNums(objects, field!);
          metrics[name] = nums.length > 0 ? Math.min(...nums) : 0;
          break;
        }

        case "max": {
          const nums = extractNums(objects, field!);
          metrics[name] = nums.length > 0 ? Math.max(...nums) : 0;
          break;
        }

        case "approximate_distinct":
        case "exact_distinct": {
          const vals = new Set(
            objects.map((o) => {
              const p = (o.properties ?? o) as Record<string, unknown>;
              return p[field!];
            }).filter((v) => v !== null && v !== undefined),
          );
          metrics[name] = vals.size;
          break;
        }

        default:
          metrics[name] = 0;
      }
    }

    return metrics;
  }

  // -------------------------------------------------------------------------
  // Full-text search
  // -------------------------------------------------------------------------

  search(
    objects: Record<string, unknown>[],
    options: SearchOptions,
  ): { data: Record<string, unknown>[]; totalCount: number } {
    const terms = options.query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return { data: objects, totalCount: objects.length };
    }

    const fields = options.fields;

    const matched = objects.filter((obj) => {
      const props = (obj.properties ?? obj) as Record<string, unknown>;
      const searchFields = fields ?? Object.keys(props);

      return terms.some((term) =>
        searchFields.some((f) => {
          const val = props[f];
          return typeof val === "string" && val.toLowerCase().includes(term);
        }),
      );
    });

    // Sort
    let sorted = matched;
    if (options.orderBy) {
      const { field, direction } = options.orderBy;
      sorted = [...matched].sort((a, b) => {
        const pa = ((a.properties ?? a) as Record<string, unknown>)[field];
        const pb = ((b.properties ?? b) as Record<string, unknown>)[field];
        if (pa === pb) return 0;
        if (pa === undefined || pa === null) return 1;
        if (pb === undefined || pb === null) return -1;
        const cmp = pa < pb ? -1 : 1;
        return direction === "desc" ? -cmp : cmp;
      });
    }

    const totalCount = sorted.length;
    const pageSize = options.pageSize ?? 20;
    const offset = options.pageToken ? parseInt(options.pageToken, 10) : 0;
    const data = sorted.slice(offset, offset + pageSize);

    return { data, totalCount };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function objKey(obj: Record<string, unknown>): string {
  return String(obj.rid ?? obj.primaryKey ?? JSON.stringify(obj));
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function extractNums(objects: Record<string, unknown>[], field: string): number[] {
  return objects
    .map((o) => {
      const props = (o.properties ?? o) as Record<string, unknown>;
      return props[field];
    })
    .filter((v): v is number => typeof v === "number");
}
