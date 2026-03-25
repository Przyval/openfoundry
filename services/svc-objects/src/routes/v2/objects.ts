import type { FastifyInstance } from "fastify";
import {
  type ObjectStore,
  type StoredObject,
} from "../../store/object-store.js";
import {
  ObjectSetQueryEngine,
  type WhereClause,
  type AggregationDef,
  type GroupByDef,
} from "@openfoundry/object-set";
import {
  encodePageToken,
  decodePageToken,
  type PageToken,
} from "@openfoundry/pagination";
import { requirePermission } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Shared query engine
// ---------------------------------------------------------------------------

const queryEngine = new ObjectSetQueryEngine();

// ---------------------------------------------------------------------------
// Route parameter / body types
// ---------------------------------------------------------------------------

interface ObjectParams {
  ontologyRid: string;
  objectType: string;
  primaryKey: string;
}

interface ListParams {
  ontologyRid: string;
  objectType: string;
}

interface CreateBody {
  primaryKey: string;
  properties: Record<string, unknown>;
}

interface UpdateBody {
  properties: Record<string, unknown>;
}

interface ListQuery {
  pageSize?: number;
  pageToken?: string;
}

// ---------------------------------------------------------------------------
// SearchJsonQueryV2 — wire format used by @osdk/client
// ---------------------------------------------------------------------------

/**
 * The OSDK client sends search requests with a `where` clause that uses
 * lowercase filter type names: eq, gt, gte, lt, lte, isNull, contains,
 * not, and, or, startsWith, containsAnyTerm, containsAllTerms.
 *
 * The `where` clause is recursive: logical combinators nest inner clauses
 * inside a `value` array (and/or) or a single `value` (not).
 */
interface SearchJsonQueryV2 {
  where?: SearchFilter;
  orderBy?: { field: string; direction?: "asc" | "desc" };
  pageSize?: number;
  pageToken?: string;
  select?: string[];
}

interface SearchFilter {
  type: string;
  field?: string;
  value?: unknown;
  values?: unknown[];
  // logical combinators
  filter?: SearchFilter;
  // not used directly; the "and"/"or" hold sub-filters in value[]
}

// ---------------------------------------------------------------------------
// Aggregate body — wire format used by @osdk/client
// ---------------------------------------------------------------------------

interface AggregateBody {
  aggregation: Array<{
    type: string;
    field?: string;
    name?: string;
    property?: string;
  }>;
  where?: SearchFilter;
  groupBy?: Array<{
    field: string;
    type: string; // "exact" | "ranges" | "fixedWidth" etc.
    ranges?: unknown[];
    fixedWidth?: number;
  }>;
  objectSet?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Convert OSDK SearchFilter → WhereClause (compatible with query engine)
// ---------------------------------------------------------------------------

function searchFilterToWhere(f: SearchFilter): WhereClause | undefined {
  if (!f || !f.type) return undefined;
  const t = f.type.toLowerCase();

  // Logical combinators: and, or hold sub-filters in f.value (array)
  if (t === "and" || t === "or") {
    return {
      type: t,
      value: Array.isArray(f.value)
        ? (f.value as SearchFilter[]).map(searchFilterToWhere)
        : [],
    } as unknown as WhereClause;
  }

  // not: holds sub-filter in f.value (single object)
  if (t === "not") {
    const inner = (f.value ?? f.filter) as SearchFilter | undefined;
    return {
      type: "not",
      value: inner ? searchFilterToWhere(inner) : undefined,
    } as unknown as WhereClause;
  }

  // containsAnyTerm: match if the field string contains ANY of the given terms
  if (t === "containsanyterm" || t === "containsAnyTerm") {
    const terms = (f.value as string | undefined)?.split(/\s+/) ?? [];
    return {
      type: "or",
      value: terms.map((term: string) => ({
        type: "contains",
        field: f.field,
        value: term,
      })),
    } as unknown as WhereClause;
  }

  // containsAllTerms: match if the field string contains ALL of the given terms
  if (t === "containsallterms" || t === "containsAllTerms") {
    const terms = (f.value as string | undefined)?.split(/\s+/) ?? [];
    return {
      type: "and",
      value: terms.map((term: string) => ({
        type: "contains",
        field: f.field,
        value: term,
      })),
    } as unknown as WhereClause;
  }

  // Map OSDK type names to query-engine type names
  const typeMap: Record<string, string> = {
    eq: "eq",
    neq: "neq",
    gt: "gt",
    gte: "gte",
    lt: "lt",
    lte: "lte",
    contains: "contains",
    startswith: "startsWith",
    startsWith: "startsWith",
    isnull: "isNull",
    isNull: "isNull",
    in: "in",
  };

  return {
    type: typeMap[t] ?? t,
    field: f.field,
    value: f.value,
    values: f.values,
  } as unknown as WhereClause;
}

// ---------------------------------------------------------------------------
// Helper: apply `select` to objects (project only requested properties)
// ---------------------------------------------------------------------------

function applySelect(objects: StoredObject[], select?: string[]): StoredObject[] {
  if (!select || select.length === 0) return objects;
  return objects.map((obj) => {
    const filtered: Record<string, unknown> = {};
    for (const prop of select) {
      if (prop in obj.properties) {
        filtered[prop] = obj.properties[prop];
      }
    }
    return { ...obj, properties: filtered };
  });
}

// ---------------------------------------------------------------------------
// Helper: paginate an array of objects
// ---------------------------------------------------------------------------

function paginate(
  objects: StoredObject[],
  pageSize: number,
  pageToken?: string,
): { data: StoredObject[]; nextPageToken?: string } {
  let offset = 0;
  if (pageToken) {
    try {
      const cursor = decodePageToken(pageToken as PageToken);
      offset = cursor.offset;
    } catch {
      // If the token is a plain number, use it directly
      offset = parseInt(pageToken, 10) || 0;
    }
  }

  const slice = objects.slice(offset, offset + pageSize + 1);
  const hasMore = slice.length > pageSize;
  const data = hasMore ? slice.slice(0, pageSize) : slice;

  return {
    data,
    ...(hasMore ? { nextPageToken: encodePageToken({ offset: offset + pageSize }) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function objectRoutes(
  app: FastifyInstance,
  opts: { store: ObjectStore },
): Promise<void> {
  const { store } = opts;

  // List objects (paginated)
  app.get<{ Params: ListParams; Querystring: ListQuery }>(
    "/ontologies/:ontologyRid/objects/:objectType",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectType } = request.params;
      const { pageSize, pageToken } = request.query;
      return store.listObjects(objectType, {
        pageSize: pageSize ? Number(pageSize) : undefined,
        pageToken,
      });
    },
  );

  // Get single object
  app.get<{ Params: ObjectParams }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectType, primaryKey } = request.params;
      return store.getObject(objectType, primaryKey);
    },
  );

  // Create object
  app.post<{ Params: ListParams; Body: CreateBody }>(
    "/ontologies/:ontologyRid/objects/:objectType",
    {
      preHandler: requirePermission("objects:write"),
    },
    async (request, reply) => {
      const { objectType } = request.params;
      const { primaryKey, properties } = request.body;
      const obj = store.createObject(objectType, primaryKey, properties);
      return reply.status(201).send(obj);
    },
  );

  // Update object
  app.put<{ Params: ObjectParams; Body: UpdateBody }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
    {
      preHandler: requirePermission("objects:write"),
    },
    async (request) => {
      const { objectType, primaryKey } = request.params;
      const { properties } = request.body;
      return store.updateObject(objectType, primaryKey, properties);
    },
  );

  // Delete object
  app.delete<{ Params: ObjectParams }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
    {
      preHandler: requirePermission("objects:delete"),
    },
    async (request, reply) => {
      const { objectType, primaryKey } = request.params;
      store.deleteObject(objectType, primaryKey);
      return reply.status(204).send();
    },
  );

  // ---------------------------------------------------------------------------
  // POST /ontologies/:ontologyRid/objects/:objectType/search
  //
  // OSDK-compatible search endpoint.  Accepts SearchJsonQueryV2:
  //   { where: { type: "eq", field: "prop", value: "val" }, pageSize, pageToken, select }
  //
  // Supported filter operators:
  //   eq, gt, gte, lt, lte, isNull, contains, not, and, or,
  //   startsWith, containsAnyTerm, containsAllTerms
  // ---------------------------------------------------------------------------
  app.post<{ Params: ListParams; Body: SearchJsonQueryV2 }>(
    "/ontologies/:ontologyRid/objects/:objectType/search",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectType } = request.params;
      const { where, orderBy, pageSize = 100, pageToken, select } = request.body;

      // Start with all objects of this type
      let objects = store.allObjects(objectType);

      // Apply where filter
      if (where) {
        const whereClause = searchFilterToWhere(where);
        if (whereClause) {
          objects = objects.filter((obj) =>
            queryEngine.evaluateWhere(
              obj as unknown as Record<string, unknown>,
              whereClause,
            ),
          );
        }
      }

      // Apply ordering
      if (orderBy) {
        const dir = orderBy.direction ?? "asc";
        objects = [...objects].sort((a, b) => {
          const aVal = a.properties[orderBy.field];
          const bVal = b.properties[orderBy.field];
          if (aVal === bVal) return 0;
          if (aVal === undefined || aVal === null) return 1;
          if (bVal === undefined || bVal === null) return -1;
          const cmp = aVal < bVal ? -1 : 1;
          return dir === "desc" ? -cmp : cmp;
        });
      }

      // Paginate
      const page = paginate(objects, pageSize, pageToken);

      // Apply select (property projection)
      const data = applySelect(page.data, select);

      return {
        data,
        ...(page.nextPageToken ? { nextPageToken: page.nextPageToken } : {}),
      };
    },
  );

  // ---------------------------------------------------------------------------
  // POST /ontologies/:ontologyRid/objects/:objectType/aggregate
  //
  // OSDK-compatible per-type aggregation endpoint.  Accepts:
  //   {
  //     aggregation: [{ type: "count" }, { type: "avg", field: "salary" }],
  //     where: { ... },           // optional pre-filter
  //     groupBy: [{ field: "department", type: "exact" }]
  //   }
  //
  // Supported aggregation types:
  //   count, min, max, avg, sum, approximateDistinct
  //
  // Returns: { data: [{ group: {...}, metrics: [{...}] }] }
  // ---------------------------------------------------------------------------
  app.post<{ Params: ListParams; Body: AggregateBody }>(
    "/ontologies/:ontologyRid/objects/:objectType/aggregate",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectType } = request.params;
      const { aggregation: aggregations, where, groupBy } = request.body;

      // Start with all objects of this type
      let objects = store.allObjects(objectType);

      // Apply optional where filter
      if (where) {
        const whereClause = searchFilterToWhere(where);
        if (whereClause) {
          objects = objects.filter((obj) =>
            queryEngine.evaluateWhere(
              obj as unknown as Record<string, unknown>,
              whereClause,
            ),
          );
        }
      }

      // Normalise aggregation defs for the query engine
      const aggDefs: AggregationDef[] = aggregations.map((a) => ({
        type: a.type,
        field: a.field ?? a.property,
        name: a.name ?? a.type,
      }));

      // Normalise groupBy defs
      const groupByDefs: GroupByDef[] | undefined = groupBy?.map((g) => ({
        field: g.field,
        type: g.type,
      }));

      // Use query engine for grouped aggregation (returns group+metrics format)
      if (groupByDefs && groupByDefs.length > 0) {
        const results = queryEngine.aggregate(
          objects as unknown as Record<string, unknown>[],
          aggDefs,
          groupByDefs,
        );

        // Convert from { group, metrics: Record<string,number> }
        // to OSDK format: { group, metrics: [{ name, type, value }] }
        const data = results.map((r) => ({
          group: r.group,
          metrics: aggregations.map((a) => {
            const name = a.name ?? a.type;
            return {
              name,
              type: a.type,
              ...(a.field ? { field: a.field } : {}),
              ...(a.property ? { field: a.property } : {}),
              value: r.metrics[name] ?? 0,
            };
          }),
        }));

        return { data };
      }

      // Ungrouped: compute metrics for the whole set
      const metrics = queryEngine.aggregate(
        objects as unknown as Record<string, unknown>[],
        aggDefs,
      );

      // Convert to OSDK format: single group with empty group key
      const data = metrics.map((r) => ({
        group: r.group,
        metrics: aggregations.map((a) => {
          const name = a.name ?? a.type;
          return {
            name,
            type: a.type,
            ...(a.field ? { field: a.field } : {}),
            ...(a.property ? { field: a.property } : {}),
            value: r.metrics[name] ?? 0,
          };
        }),
      }));

      return { data };
    },
  );
}
