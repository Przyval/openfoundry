import type { FastifyInstance } from "fastify";
import {
  type ObjectReadWriteStore,
  type ObjectTypeSchemaSource,
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
  type PageCursor,
  type PageToken,
} from "@openfoundry/pagination";
import { requirePermission } from "@openfoundry/permissions";
import { rejectUnsupportedOntologyScoping } from "@openfoundry/errors";
import { writeAuditLog } from "@openfoundry/db";
import {
  applyExcludeRid,
  applyOrderBy,
  assertPropertiesExist,
  applySelect as applySelectedProperties,
  applySnapshot,
  parseBooleanParam,
  parseListParam,
  parseOrderBy,
  resolveSnapshotSize,
} from "./query-params.js";

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

/**
 * Query parameters of `GET /v2/ontologies/{ontology}/objects/{objectType}`.
 *
 * Declared inline rather than as a named type so the contract is legible in the
 * route registration itself.
 */
interface ListQuery {
  pageSize?: number;
  pageToken?: string;
  select?: string | string[];
  orderBy?: string;
  excludeRid?: string;
  snapshot?: string;
  branch?: string;
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
  opts: {
    store: ObjectReadWriteStore;
    objectTypeSchema?: ObjectTypeSchemaSource;
    pool?: import("pg").Pool;
  },
): Promise<void> {
  const { store, objectTypeSchema, pool } = opts;

  const declaredProperties = (ontologyRid: string, objectType: string) =>
    objectTypeSchema
      ? objectTypeSchema.propertyNames(ontologyRid, objectType)
      : store.propertyNames?.(ontologyRid, objectType);

  // List objects (paginated)
  app.get<{
    Params: ListParams;
    Querystring: {
      pageSize?: number;
      pageToken?: string;
      select?: string | string[];
      orderBy?: string;
      excludeRid?: string;
      snapshot?: string;
      branch?: string;
    };
  }>(
    "/ontologies/:ontologyRid/objects/:objectType",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      const { ontologyRid, objectType } = request.params;
      const query = request.query as ListQuery;

      const select = parseListParam(query.select);
      const orderBy = parseOrderBy(query.orderBy);
      const excludeRid = parseBooleanParam("excludeRid", query.excludeRid);
      const snapshot = parseBooleanParam("snapshot", query.snapshot);

      const pageSize = query.pageSize ? Number(query.pageSize) : 100;
      const cursor: PageCursor = query.pageToken
        ? decodePageToken(query.pageToken as PageToken)
        : { offset: 0 };

      // A snapshot listing freezes its view at the size the collection had
      // when paging began and carries that boundary forward in every token.
      const declared = await declaredProperties(ontologyRid, objectType);
      assertPropertiesExist(objectType, declared, select);
      assertPropertiesExist(
        objectType,
        declared,
        orderBy?.map((term) => term.property),
      );

      const project = (page: StoredObject[]) =>
        applyExcludeRid(applySelectedProperties(page, select), excludeRid);

      // Ordering spans the whole collection and a snapshot has to freeze its
      // size, so only those two need every object read. A plain listing stays
      // on the store's paged path, which is a LIMIT/OFFSET against Postgres
      // rather than one full read of the type per page.
      if (!orderBy && snapshot !== true && cursor.snapshotSize === undefined) {
        const result = await store.listObjects(objectType, {
          pageSize,
          ...(query.pageToken ? { pageToken: query.pageToken } : {}),
        });
        return {
          data: project(result.data),
          totalCount: result.totalCount,
          ...(result.nextPageToken
            ? { nextPageToken: result.nextPageToken }
            : {}),
        };
      }

      const all = await store.allObjects(objectType);
      const snapshotSize = resolveSnapshotSize(
        snapshot,
        cursor.snapshotSize,
        all.length,
      );

      let objects = applySnapshot(all, snapshotSize);
      if (orderBy) {
        objects = applyOrderBy(objects, orderBy);
      }
      const totalCount = objects.length;

      const slice = objects.slice(cursor.offset, cursor.offset + pageSize + 1);
      const hasMore = slice.length > pageSize;
      const page = hasMore ? slice.slice(0, pageSize) : slice;

      return {
        data: project(page),
        totalCount,
        ...(hasMore
          ? {
              nextPageToken: encodePageToken({
                offset: cursor.offset + pageSize,
                ...(snapshotSize !== undefined && { snapshotSize }),
              }),
            }
          : {}),
      };
    },
  );

  // Get single object
  app.get<{
    Params: ObjectParams;
    Querystring: { select?: string | string[]; excludeRid?: string; branch?: string };
  }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      const { ontologyRid, objectType, primaryKey } = request.params;
      const select = parseListParam(request.query.select);
      const excludeRid = parseBooleanParam("excludeRid", request.query.excludeRid);

      assertPropertiesExist(
        objectType,
        await declaredProperties(ontologyRid, objectType),
        select,
      );

      const object = await store.getObject(objectType, primaryKey);
      const [result] = applyExcludeRid(
        applySelectedProperties([object], select),
        excludeRid,
      );
      return result;
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
      const upsert = (request.body as unknown as Record<string, unknown>).upsert === true;
      const obj = upsert && store.upsertObject
        ? await store.upsertObject(objectType, primaryKey, properties)
        : await store.createObject(objectType, primaryKey, properties);
      if (pool) {
        const claims = (request as unknown as Record<string, unknown>).claims as Record<string, unknown> | undefined;
        writeAuditLog(pool, {
          userRid: typeof claims?.sub === "string" ? claims.sub : undefined,
          action: upsert ? "object.update" : "object.create",
          resourceRid: obj.rid,
          resourceType: objectType,
          details: { primaryKey, ontologyRid: request.params.ontologyRid },
          ipAddress: request.ip,
        });
      }
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
      return await store.updateObject(objectType, primaryKey, properties);
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
      await store.deleteObject(objectType, primaryKey);
      if (pool) {
        const claims = (request as unknown as Record<string, unknown>).claims as Record<string, unknown> | undefined;
        writeAuditLog(pool, {
          userRid: typeof claims?.sub === "string" ? claims.sub : undefined,
          action: "object.delete",
          resourceType: objectType,
          details: { primaryKey, ontologyRid: request.params.ontologyRid },
          ipAddress: request.ip,
        });
      }
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
  app.post<{
    Params: ListParams;
    Querystring: { executeInMemoryOnly?: string; branch?: string };
    Body: SearchJsonQueryV2;
  }>(
    "/ontologies/:ontologyRid/objects/:objectType/search",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      const { objectType } = request.params;
      // `executeInMemoryOnly` asks the service to fail rather than fall back to
      // heavier computation. This handler resolves the whole search from the
      // in-memory object store, so the guarantee always holds and the flag can
      // only fail validation.
      parseBooleanParam("executeInMemoryOnly", request.query.executeInMemoryOnly);
      const { where, orderBy, pageSize = 100, pageToken, select } = request.body;

      const declared = await declaredProperties(
        request.params.ontologyRid,
        objectType,
      );
      assertPropertiesExist(objectType, declared, select);
      assertPropertiesExist(
        objectType,
        declared,
        orderBy ? [orderBy.field] : undefined,
      );

      // Start with all objects of this type
      let objects = await store.allObjects(objectType);

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
      const data = applySelectedProperties(page.data, select);

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
  app.post<{
    Params: ListParams;
    Querystring: { branch?: string };
    Body: AggregateBody;
  }>(
    "/ontologies/:ontologyRid/objects/:objectType/aggregate",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      const { objectType } = request.params;
      const { aggregation: aggregations, where, groupBy } = request.body;

      // Start with all objects of this type
      let objects = await store.allObjects(objectType);

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
