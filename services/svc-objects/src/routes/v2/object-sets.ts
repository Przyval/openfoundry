import type { FastifyInstance } from "fastify";
import type { ObjectSet, Aggregation } from "@openfoundry/object-set";
import {
  ObjectSetQueryEngine,
  type WhereClause,
  type AggregationDef,
  type GroupByDef,
} from "@openfoundry/object-set";
import {
  type ObjectReadWriteStore,
  type ObjectTypeSchemaSource,
  type StoredObject,
  type OrderByClause,
  evaluateFilter,
  evaluateAggregation,
} from "../../store/object-store.js";
import type { LinkStore } from "../../store/link-store.js";
import { encodePageToken, decodePageToken, type PageToken } from "@openfoundry/pagination";
import { requirePermission } from "@openfoundry/permissions";
import { rejectUnsupportedOntologyScoping } from "@openfoundry/errors";
import { assertPropertiesExist, parseBooleanParam } from "./query-params.js";

// ---------------------------------------------------------------------------
// Query engine singleton
// ---------------------------------------------------------------------------

const queryEngine = new ObjectSetQueryEngine();

// ---------------------------------------------------------------------------
// ObjectSet resolver
// ---------------------------------------------------------------------------

async function resolveObjectSet(
  objectSetDef: ObjectSet,
  store: ObjectReadWriteStore,
  linkStore: LinkStore,
): Promise<StoredObject[]> {
  switch (objectSetDef.type) {
    case "BASE":
      return store.allObjects(objectSetDef.objectType);

    case "FILTER": {
      const source = await resolveObjectSet(objectSetDef.objectSet, store, linkStore);
      return source.filter((obj) => evaluateFilter(obj, objectSetDef.filter));
    }

    case "UNION": {
      const sets = await Promise.all(
        objectSetDef.objectSets.map((s) =>
          resolveObjectSet(s, store, linkStore),
        ),
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
      const sets = await Promise.all(
        objectSetDef.objectSets.map((s) =>
          resolveObjectSet(s, store, linkStore),
        ),
      );
      if (sets.length === 0) return [];
      const ridSets = sets.map((s) => new Set(s.map((o) => o.rid)));
      return sets[0].filter((obj) =>
        ridSets.every((rids) => rids.has(obj.rid)),
      );
    }

    case "SUBTRACT": {
      const [left, right] = objectSetDef.objectSets;
      const leftObjects = await resolveObjectSet(left, store, linkStore);
      const rightRids = new Set(
        (await resolveObjectSet(right, store, linkStore)).map((o) => o.rid),
      );
      return leftObjects.filter((obj) => !rightRids.has(obj.rid));
    }

    case "STATIC":
      return store.getObjectsByKeys(objectSetDef.objectType, objectSetDef.primaryKeys);

    case "SEARCH_AROUND": {
      const sourceObjects = await resolveObjectSet(objectSetDef.objectSet, store, linkStore);
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
            const obj = await store.getObject(target.targetObjectType, target.targetPrimaryKey);
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
async function resolveApiObjectSet(
  objectSetDef: Record<string, unknown>,
  store: ObjectReadWriteStore,
  linkStore: LinkStore,
): Promise<StoredObject[]> {
  const type = String(objectSetDef.type ?? "").toUpperCase();

  // First, try to use it as a canonical ObjectSet if the type matches
  if (type === "BASE" && objectSetDef.objectType) {
    return store.allObjects(String(objectSetDef.objectType));
  }

  if (type === "FILTER") {
    const inner = objectSetDef.objectSet as Record<string, unknown> | undefined;
    const source = inner
      ? await resolveApiObjectSet(inner, store, linkStore)
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
      for (const obj of await resolveApiObjectSet(setDef, store, linkStore)) {
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
    const resolved = await Promise.all(
      sets.map((s) => resolveApiObjectSet(s, store, linkStore)),
    );
    const ridSets = resolved.map((s) => new Set(s.map((o) => o.rid)));
    return resolved[0].filter((obj) =>
      ridSets.every((rids) => rids.has(obj.rid)),
    );
  }

  if (type === "SUBTRACT") {
    const sets = (objectSetDef.objectSets as Record<string, unknown>[]) ?? [];
    if (sets.length < 2) return [];
    const left = await resolveApiObjectSet(sets[0], store, linkStore);
    const rightRids = new Set(
      (await resolveApiObjectSet(sets[1], store, linkStore)).map((o) => o.rid),
    );
    return left.filter((obj) => !rightRids.has(obj.rid));
  }

  if (type === "STATIC") {
    const keys = (objectSetDef.primaryKeys as string[]) ?? [];
    return store.getObjectsByKeys(String(objectSetDef.objectType ?? ""), keys);
  }

  if (type === "SEARCH_AROUND" || type === "SEARCHAROUND") {
    const inner = objectSetDef.objectSet as Record<string, unknown> | undefined;
    const sourceObjects = inner
      ? await resolveApiObjectSet(inner, store, linkStore)
      : [];
    const link = String(objectSetDef.link ?? "");
    const result: StoredObject[] = [];
    const seen = new Set<string>();
    for (const source of sourceObjects) {
      const targets = linkStore.getLinkedObjects(
        source.objectType,
        source.primaryKey,
        link,
      );
      for (const target of targets) {
        try {
          const obj = await store.getObject(target.targetObjectType, target.targetPrimaryKey);
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

  // Fallback: try canonical resolver
  try {
    return await resolveObjectSet(objectSetDef as unknown as ObjectSet, store, linkStore);
  } catch {
    return [];
  }
}

/**
 * The object types a set draws its results from, per the definition alone.
 *
 * Only `base` and `static` name a type; every other form has to be walked to
 * its leaves. `intersect` and `subtract` draw only from their first operand,
 * `union` from all of them. Returns `undefined` whenever the definition cannot
 * say - an unnamed leaf, an empty set, or a `searchAround`, whose results are
 * of the link type's target rather than of anything the body names - so the
 * caller makes no claim it has no grounds for.
 */
function objectSetLeafTypes(
  objectSetDef: Record<string, unknown>,
): string[] | undefined {
  const type = String(objectSetDef.type ?? "").toUpperCase();

  if (type === "BASE" || type === "STATIC") {
    return typeof objectSetDef.objectType === "string"
      ? [objectSetDef.objectType]
      : undefined;
  }

  if (type === "FILTER") {
    const inner = objectSetDef.objectSet as Record<string, unknown> | undefined;
    return inner ? objectSetLeafTypes(inner) : undefined;
  }

  if (type === "INTERSECT" || type === "SUBTRACT") {
    const sets = (objectSetDef.objectSets as Record<string, unknown>[]) ?? [];
    return sets.length > 0 ? objectSetLeafTypes(sets[0]) : undefined;
  }

  if (type === "UNION") {
    const sets = (objectSetDef.objectSets as Record<string, unknown>[]) ?? [];
    if (sets.length === 0) return undefined;
    const nested = sets.map(objectSetLeafTypes);
    if (nested.some((types) => types === undefined)) return undefined;
    return [...new Set((nested as string[][]).flat())];
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

interface OntologyParams {
  ontologyRid: string;
}

interface LoadObjectsBody {
  objectSet: Record<string, unknown>;
  select?: string[];
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
  opts: {
    store: ObjectReadWriteStore;
    linkStore: LinkStore;
    objectTypeSchema?: ObjectTypeSchemaSource;
  },
): Promise<void> {
  const { store, linkStore, objectTypeSchema } = opts;

  const declaredProperties = (ontologyRid: string, objectType: string) =>
    objectTypeSchema
      ? objectTypeSchema.propertyNames(ontologyRid, objectType)
      : store.propertyNames?.(ontologyRid, objectType);

  /**
   * The properties declared across the object types an object set draws from.
   *
   * A union spans several types, so a name is known when any of them declares
   * it. `properties` stays `undefined` if the leaves cannot be resolved or any
   * one of them has no declaration, since an incomplete union would call a
   * legitimate name unknown.
   */
  const declaredForSet = async (
    ontologyRid: string,
    objectSetDef: Record<string, unknown>,
  ): Promise<{ objectType: string; properties?: ReadonlySet<string> }> => {
    const types = objectSetLeafTypes(objectSetDef);
    if (!types || types.length === 0) return { objectType: "" };

    const objectType = types.join(", ");
    const sets = await Promise.all(
      types.map((type) => declaredProperties(ontologyRid, type)),
    );
    if (sets.some((set) => set === undefined)) return { objectType };
    return {
      objectType,
      properties: new Set((sets as ReadonlySet<string>[]).flatMap((s) => [...s])),
    };
  };

  // Load objects from an ObjectSet query (enhanced with filter/where support)
  app.post<{
    Params: OntologyParams;
    Querystring: {
      executeInMemoryOnly?: string;
      branch?: string;
      scenarioRid?: string;
      transactionId?: string;
    };
    Body: LoadObjectsBody;
  }>(
    "/ontologies/:ontologyRid/objectSets/loadObjects",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      // The object set is resolved entirely from the in-memory object store,
      // so the in-memory-only guarantee always holds; the flag is validated
      // rather than silently swallowed.
      parseBooleanParam("executeInMemoryOnly", request.query.executeInMemoryOnly);
      const { objectSet: objectSetDef, select, pageSize = 100, pageToken, orderBy } = request.body;

      const declared = await declaredForSet(
        request.params.ontologyRid,
        objectSetDef,
      );
      assertPropertiesExist(declared.objectType, declared.properties, select);
      assertPropertiesExist(
        declared.objectType,
        declared.properties,
        orderBy?.map((clause) => clause.field),
      );

      let objects = await resolveApiObjectSet(objectSetDef, store, linkStore);

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
      let data: StoredObject[] = hasMore ? slice.slice(0, pageSize) : slice;

      // Apply select (property projection)
      if (select && select.length > 0) {
        data = data.map((obj) => {
          const filtered: Record<string, unknown> = {};
          for (const prop of select) {
            if (prop in obj.properties) {
              filtered[prop] = obj.properties[prop];
            }
          }
          return { ...obj, properties: filtered };
        });
      }

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
  app.post<{
    Params: OntologyParams;
    Querystring: {
      executeInMemoryOnly?: string;
      branch?: string;
      scenarioRid?: string;
      transactionId?: string;
    };
    Body: AggregateBody;
  }>(
    "/ontologies/:ontologyRid/objectSets/aggregate",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      // See loadObjects: aggregation runs over the in-memory object store.
      parseBooleanParam("executeInMemoryOnly", request.query.executeInMemoryOnly);
      const { objectSet: objectSetDef, aggregation: aggregations, groupBy } = request.body;

      const objects = await resolveApiObjectSet(objectSetDef, store, linkStore);

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

      const objects = await resolveApiObjectSet(objectSetDef, store, linkStore);

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
