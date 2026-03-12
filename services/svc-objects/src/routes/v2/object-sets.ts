import type { FastifyInstance } from "fastify";
import type { ObjectSet, Aggregation } from "@openfoundry/object-set";
import {
  ObjectSetQueryEngine,
  type WhereClause,
  type AggregationDef,
  type GroupByDef,
} from "@openfoundry/object-set";
import {
  type ObjectStore,
  type StoredObject,
  type OrderByClause,
  evaluateFilter,
  evaluateAggregation,
} from "../../store/object-store.js";
import type { LinkStore } from "../../store/link-store.js";
import { encodePageToken, decodePageToken, type PageToken } from "@openfoundry/pagination";
import { requirePermission } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Query engine singleton
// ---------------------------------------------------------------------------

const queryEngine = new ObjectSetQueryEngine();

// ---------------------------------------------------------------------------
// ObjectSet resolver
// ---------------------------------------------------------------------------

function resolveObjectSet(
  objectSetDef: ObjectSet,
  store: ObjectStore,
  linkStore: LinkStore,
): StoredObject[] {
  switch (objectSetDef.type) {
    case "BASE":
      return store.allObjects(objectSetDef.objectType);

    case "FILTER": {
      const source = resolveObjectSet(objectSetDef.objectSet, store, linkStore);
      return source.filter((obj) => evaluateFilter(obj, objectSetDef.filter));
    }

    case "UNION": {
      const sets = objectSetDef.objectSets.map((s) =>
        resolveObjectSet(s, store, linkStore),
      );
      // Deduplicate by rid
      const seen = new Set<string>();
      const result: StoredObject[] = [];
      for (const set of sets) {
        for (const obj of set) {
          if (!seen.has(obj.rid)) {
            seen.add(obj.rid);
            result.push(obj);
          }
        }
      }
      return result;
    }

    case "INTERSECT": {
      const sets = objectSetDef.objectSets.map((s) =>
        resolveObjectSet(s, store, linkStore),
      );
      if (sets.length === 0) return [];
      const ridSets = sets.map((s) => new Set(s.map((o) => o.rid)));
      return sets[0].filter((obj) =>
        ridSets.every((rids) => rids.has(obj.rid)),
      );
    }

    case "SUBTRACT": {
      const [left, right] = objectSetDef.objectSets;
      const leftObjects = resolveObjectSet(left, store, linkStore);
      const rightRids = new Set(
        resolveObjectSet(right, store, linkStore).map((o) => o.rid),
      );
      return leftObjects.filter((obj) => !rightRids.has(obj.rid));
    }

    case "STATIC":
      return store.getObjectsByKeys(objectSetDef.objectType, objectSetDef.primaryKeys);

    case "SEARCH_AROUND": {
      const sourceObjects = resolveObjectSet(objectSetDef.objectSet, store, linkStore);
      const result: StoredObject[] = [];
      const seen = new Set<string>();
      for (const source of sourceObjects) {
        const targets = linkStore.getLinkedObjects(
          source.objectType,
          source.primaryKey,
          objectSetDef.link,
        );
        for (const target of targets) {
          try {
            const obj = store.getObject(target.targetObjectType, target.targetPrimaryKey);
            if (!seen.has(obj.rid)) {
              seen.add(obj.rid);
              result.push(obj);
            }
          } catch {
            // Skip objects that no longer exist
          }
        }
      }
      return result;
    }

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Resolve object set from API wire format (lowercase types + where clauses)
// ---------------------------------------------------------------------------

/**
 * Resolves an object set definition in the API wire format which supports
 * lowercase type names ("base", "filter") and "where" clauses in addition
 * to the internal canonical format.
 */
function resolveApiObjectSet(
  objectSetDef: Record<string, unknown>,
  store: ObjectStore,
  linkStore: LinkStore,
): StoredObject[] {
  const type = String(objectSetDef.type ?? "").toUpperCase();

  // First, try to use it as a canonical ObjectSet if the type matches
  if (type === "BASE" && objectSetDef.objectType) {
    return store.allObjects(String(objectSetDef.objectType));
  }

  if (type === "FILTER") {
    const inner = objectSetDef.objectSet as Record<string, unknown> | undefined;
    const source = inner
      ? resolveApiObjectSet(inner, store, linkStore)
      : [];

    // Support "where" clause (API wire format)
    if (objectSetDef.where) {
      const where = objectSetDef.where as WhereClause;
      return source.filter((obj) =>
        queryEngine.evaluateWhere(obj as unknown as Record<string, unknown>, where),
      );
    }

    // Support "filter" (canonical format)
    if (objectSetDef.filter) {
      return source.filter((obj) =>
        evaluateFilter(obj, objectSetDef.filter as any),
      );
    }

    return source;
  }

  if (type === "UNION") {
    const sets = (objectSetDef.objectSets as Record<string, unknown>[]) ?? [];
    const seen = new Set<string>();
    const result: StoredObject[] = [];
    for (const setDef of sets) {
      for (const obj of resolveApiObjectSet(setDef, store, linkStore)) {
        if (!seen.has(obj.rid)) {
          seen.add(obj.rid);
          result.push(obj);
        }
      }
    }
    return result;
  }

  if (type === "INTERSECT") {
    const sets = (objectSetDef.objectSets as Record<string, unknown>[]) ?? [];
    if (sets.length === 0) return [];
    const resolved = sets.map((s) => resolveApiObjectSet(s, store, linkStore));
    const ridSets = resolved.map((s) => new Set(s.map((o) => o.rid)));
    return resolved[0].filter((obj) =>
      ridSets.every((rids) => rids.has(obj.rid)),
    );
  }

  if (type === "SUBTRACT") {
    const sets = (objectSetDef.objectSets as Record<string, unknown>[]) ?? [];
    if (sets.length < 2) return [];
    const left = resolveApiObjectSet(sets[0], store, linkStore);
    const rightRids = new Set(
      resolveApiObjectSet(sets[1], store, linkStore).map((o) => o.rid),
    );
    return left.filter((obj) => !rightRids.has(obj.rid));
  }

  if (type === "STATIC") {
    const keys = (objectSetDef.primaryKeys as string[]) ?? [];
    return store.getObjectsByKeys(String(objectSetDef.objectType ?? ""), keys);
  }

  // Fallback: try canonical resolver
  try {
    return resolveObjectSet(objectSetDef as unknown as ObjectSet, store, linkStore);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

interface OntologyParams {
  ontologyRid: string;
}

interface LoadObjectsBody {
  objectSet: Record<string, unknown>;
  pageSize?: number;
  pageToken?: string;
  orderBy?: OrderByClause[];
}

interface AggregateBody {
  objectSet: Record<string, unknown>;
  aggregation: Array<AggregationDef & { type: string }>;
  groupBy?: GroupByDef[];
}

interface SearchBody {
  objectSet: Record<string, unknown>;
  query: string;
  fields?: string[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  pageSize?: number;
  pageToken?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function objectSetRoutes(
  app: FastifyInstance,
  opts: { store: ObjectStore; linkStore: LinkStore },
): Promise<void> {
  const { store, linkStore } = opts;

  // Load objects from an ObjectSet query (enhanced with filter/where support)
  app.post<{ Params: OntologyParams; Body: LoadObjectsBody }>(
    "/ontologies/:ontologyRid/objectSets/loadObjects",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectSet: objectSetDef, pageSize = 100, pageToken, orderBy } = request.body;

      let objects = resolveApiObjectSet(objectSetDef, store, linkStore);

      // Apply ordering
      if (orderBy && orderBy.length > 0) {
        objects = [...objects].sort((a, b) => {
          for (const clause of orderBy) {
            const aVal = a.properties[clause.field];
            const bVal = b.properties[clause.field];

            if (aVal === bVal) continue;
            if (aVal === undefined || aVal === null) return 1;
            if (bVal === undefined || bVal === null) return -1;

            const cmp = aVal < bVal ? -1 : 1;
            return clause.direction === "desc" ? -cmp : cmp;
          }
          return 0;
        });
      }

      const totalCount = objects.length;

      // Pagination
      let offset = 0;
      if (pageToken) {
        const cursor = decodePageToken(pageToken as PageToken);
        offset = cursor.offset;
      }

      const slice = objects.slice(offset, offset + pageSize + 1);
      const hasMore = slice.length > pageSize;
      const data = hasMore ? slice.slice(0, pageSize) : slice;

      const result: {
        data: StoredObject[];
        totalCount: number;
        nextPageToken?: string;
      } = { data, totalCount };

      if (hasMore) {
        result.nextPageToken = encodePageToken({ offset: offset + pageSize });
      }

      return result;
    },
  );

  // Aggregate over an ObjectSet
  app.post<{ Params: OntologyParams; Body: AggregateBody }>(
    "/ontologies/:ontologyRid/objectSets/aggregate",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectSet: objectSetDef, aggregation: aggregations, groupBy } = request.body;

      const objects = resolveApiObjectSet(objectSetDef, store, linkStore);

      if (groupBy && groupBy.length > 0) {
        // Grouped aggregation: use query engine, return new format
        const aggDefs: AggregationDef[] = aggregations.map((a) => ({
          type: a.type,
          field: a.field ?? (a as unknown as Record<string, unknown>).property as string | undefined,
          name: a.name ?? a.type,
        }));

        const results = queryEngine.aggregate(
          objects as unknown as Record<string, unknown>[],
          aggDefs,
          groupBy,
        );

        return { data: results };
      }

      // No groupBy: backward-compatible flat array of AggregationResult objects
      // Each aggregation becomes its own entry in the array
      const data = aggregations.map((agg) => {
        const aggType = agg.type.toUpperCase();
        const property = agg.field ?? (agg as unknown as Record<string, unknown>).property as string | undefined;

        // Use the evaluateAggregation helper for canonical format
        const canonical = {
          type: aggType,
          ...(property ? { property } : {}),
        } as unknown as Aggregation;

        return evaluateAggregation(objects, canonical);
      });

      return { data };
    },
  );

  // Full-text search within an ObjectSet
  app.post<{ Params: OntologyParams; Body: SearchBody }>(
    "/ontologies/:ontologyRid/objectSets/search",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const {
        objectSet: objectSetDef,
        query,
        fields,
        orderBy,
        pageSize = 20,
        pageToken,
      } = request.body;

      const objects = resolveApiObjectSet(objectSetDef, store, linkStore);

      const result = queryEngine.search(
        objects as unknown as Record<string, unknown>[],
        { query, fields, orderBy, pageSize, pageToken },
      );

      return {
        data: result.data,
        totalCount: result.totalCount,
        nextPageToken:
          result.data.length < result.totalCount
            ? String(
                (pageToken ? parseInt(pageToken, 10) : 0) + result.data.length,
              )
            : undefined,
      };
    },
  );
}
