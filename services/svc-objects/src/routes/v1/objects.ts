import type { FastifyInstance } from "fastify";
import { ObjectSetQueryEngine, type AggregationDef } from "@openfoundry/object-set";
import {
  encodePageToken,
  decodePageToken,
  type PageCursor,
  type PageToken,
} from "@openfoundry/pagination";
import { requirePermission } from "@openfoundry/permissions";
import { invalidArgument } from "@openfoundry/errors";
import type {
  ObjectReadWriteStore,
  ObjectTypeSchemaSource,
  StoredObject,
} from "../../store/object-store.js";
import type { LinkStore } from "../../store/link-store.js";
import {
  applyOrderBy,
  applySelect,
  assertPropertiesExist,
  assertStringListBody,
  parseListParam,
  parseOrderBy,
  parsePageSize,
  type OrderByTerm,
} from "../v2/query-params.js";
import { matchesV1Query, queryFields, type V1SearchQuery } from "./search-query.js";
import {
  toV1OntologyObject,
  type V1AggregateObjectsResponseItem,
} from "./serializers.js";

const queryEngine = new ObjectSetQueryEngine();

const DEFAULT_PAGE_SIZE = 100;

/**
 * The aggregation functions the shared query engine implements, keyed by the v1
 * wire name and valued by the engine's own type label.
 *
 * The two differ for `approximateDistinct`, which the engine matches as
 * `approximate_distinct`; passing the wire name through reaches the engine's
 * default branch and reports every such metric as 0.
 */
const SUPPORTED_AGGREGATIONS = new Map([
  ["count", "count"],
  ["min", "min"],
  ["max", "max"],
  ["avg", "avg"],
  ["sum", "sum"],
  ["approximateDistinct", "approximate_distinct"],
]);

interface ListParams {
  ontologyRid: string;
  objectType: string;
}

interface ObjectParams extends ListParams {
  primaryKey: string;
}

interface LinkParams extends ObjectParams {
  linkType: string;
}

/** v1 `SearchOrderBy` — a list of orderings, unlike the v2 single clause. */
interface V1SearchOrderBy {
  fields?: Array<{ field: string; direction?: string }>;
}

interface SearchBody {
  query?: V1SearchQuery;
  orderBy?: V1SearchOrderBy;
  pageSize?: number;
  pageToken?: string;
  fields?: string[];
}

interface AggregateBody {
  aggregation?: Array<{ type: string; field?: string; name?: string }>;
  query?: V1SearchQuery;
  groupBy?: Array<{ field: string; type: string }>;
}

function cursorOf(pageToken: string | undefined): PageCursor {
  return pageToken ? decodePageToken(pageToken as PageToken) : { offset: 0 };
}

/**
 * Cuts one page and, when more remain, the token for the next.
 *
 * v1 responses carry `data` and an optional `nextPageToken`; whether they also
 * carry a `totalCount` differs per operation, so the caller adds it.
 */
function page(
  objects: StoredObject[],
  cursor: PageCursor,
  pageSize: number,
): { data: StoredObject[]; nextPageToken?: string } {
  const slice = objects.slice(cursor.offset, cursor.offset + pageSize + 1);
  const hasMore = slice.length > pageSize;
  return {
    data: hasMore ? slice.slice(0, pageSize) : slice,
    ...(hasMore
      ? { nextPageToken: encodePageToken({ offset: cursor.offset + pageSize }) }
      : {}),
  };
}

/** The sort direction of one v1 `SearchOrdering`; ascending when unstated. */
function parseDirection(raw: unknown): OrderByTerm["direction"] {
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    throw invalidArgument(
      "orderBy.fields",
      `sort direction must be "asc" or "desc", got ${typeof raw}`,
    );
  }
  const direction = (raw ?? "asc").toLowerCase();
  if (direction === "asc") return "asc";
  if (direction === "desc") return "desc";
  throw invalidArgument(
    "orderBy.fields",
    `sort direction must be "asc" or "desc", got "${raw}"`,
  );
}

/**
 * Parses a v1 `SearchOrderBy` into the shared `orderBy` terms.
 *
 * v1 nests its orderings under `fields` and names the property directly, where
 * the v2 body carries a single `{ field, direction }` clause. Both reduce to the
 * same sort, so only the parsing differs.
 */
function parseV1SearchOrderBy(raw: unknown): OrderByTerm[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw invalidArgument("orderBy", "must be an object { fields: [...] }");
  }
  const fields = (raw as V1SearchOrderBy).fields;
  if (fields === undefined) return undefined;
  if (!Array.isArray(fields)) {
    throw invalidArgument("orderBy.fields", "must be a list of orderings");
  }

  const terms: OrderByTerm[] = fields.map((ordering) => {
    if (
      typeof ordering !== "object" ||
      ordering === null ||
      typeof ordering.field !== "string"
    ) {
      throw invalidArgument("orderBy.fields", "each ordering needs a field");
    }
    return { property: ordering.field, direction: parseDirection(ordering.direction) };
  });

  return terms.length > 0 ? terms : undefined;
}

export async function objectRoutesV1(
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

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  // List objects.
  //
  // `ListObjectsResponse` requires `totalCount`. v1 names the projection
  // parameter `properties`, where v2 renamed it `select`.
  app.get<{
    Params: ListParams;
    Querystring: {
      properties?: string | string[];
      orderBy?: string;
      pageSize?: string;
      pageToken?: string;
    };
  }>("/ontologies/:ontologyRid/objects/:objectType", {
    preHandler: requirePermission("objects:read"),
  }, async (request) => {
    const { ontologyRid, objectType } = request.params;
    const properties = parseListParam(request.query.properties);
    const orderBy = parseOrderBy(request.query.orderBy);

    const declared = await declaredProperties(ontologyRid, objectType);
    assertPropertiesExist(objectType, declared, properties);
    assertPropertiesExist(
      objectType,
      declared,
      orderBy?.map((term) => term.property),
    );

    const pageSize = parsePageSize(request.query.pageSize) ?? DEFAULT_PAGE_SIZE;

    // Ordering spans the whole collection, so only that case needs every object
    // read; a plain listing stays on the store's paged path, which is a
    // LIMIT/OFFSET against Postgres rather than one full read of the type per
    // page.
    if (!orderBy) {
      const result = await store.listObjects(objectType, {
        pageSize,
        ...(request.query.pageToken ? { pageToken: request.query.pageToken } : {}),
      });
      return {
        data: applySelect(result.data, properties).map(toV1OntologyObject),
        totalCount: result.totalCount,
        ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
      };
    }

    const objects = applyOrderBy(await store.allObjects(objectType), orderBy);
    const result = page(objects, cursorOf(request.query.pageToken), pageSize);
    return {
      data: applySelect(result.data, properties).map(toV1OntologyObject),
      totalCount: objects.length,
      ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
    };
  });

  // Get one object
  app.get<{
    Params: ObjectParams;
    Querystring: { properties?: string | string[] };
  }>("/ontologies/:ontologyRid/objects/:objectType/:primaryKey", {
    preHandler: requirePermission("objects:read"),
  }, async (request) => {
    const { ontologyRid, objectType, primaryKey } = request.params;
    const properties = parseListParam(request.query.properties);

    assertPropertiesExist(
      objectType,
      await declaredProperties(ontologyRid, objectType),
      properties,
    );

    const object = await store.getObject(objectType, primaryKey);
    const [projected] = applySelect([object], properties);
    return toV1OntologyObject(projected);
  });

  // List linked objects.
  //
  // `ListLinkedObjectsResponse` carries no `totalCount`, unlike the plain object
  // listing next to it.
  app.get<{
    Params: LinkParams;
    Querystring: {
      properties?: string | string[];
      orderBy?: string;
      pageSize?: string;
      pageToken?: string;
    };
  }>("/ontologies/:ontologyRid/objects/:objectType/:primaryKey/links/:linkType", {
    preHandler: requirePermission("objects:read"),
  }, async (request) => {
    const { ontologyRid, objectType, primaryKey, linkType } = request.params;
    const properties = parseListParam(request.query.properties);
    const orderBy = parseOrderBy(request.query.orderBy);

    const links = linkStore.getAllLinks(objectType, primaryKey, linkType);

    // The declaration says what the far side is and what it declares, so an
    // unknown property is reported the same way whether the source object has
    // links or none.
    const target = objectTypeSchema
      ? await objectTypeSchema.linkTargetObjectType(ontologyRid, objectType, linkType)
      : await store.linkTargetObjectType?.(ontologyRid, objectType, linkType);
    const targetObjectType = target ?? objectType;
    const declared = target
      ? await (objectTypeSchema
          ? objectTypeSchema.propertyNames(ontologyRid, target)
          : store.propertyNames?.(ontologyRid, target))
      : undefined;
    assertPropertiesExist(targetObjectType, declared, properties);
    assertPropertiesExist(
      targetObjectType,
      declared,
      orderBy?.map((term) => term.property),
    );

    // Resolved one batch per target type; the whole set has to exist before the
    // page is cut, so a per-link read would fire the entire link count.
    const keysByType = new Map<string, Set<string>>();
    for (const link of links) {
      const keys = keysByType.get(link.targetObjectType) ?? new Set<string>();
      keys.add(link.targetPrimaryKey);
      keysByType.set(link.targetObjectType, keys);
    }
    const batches = await Promise.all(
      [...keysByType].map(async ([type, keys]) => {
        return [type, await store.getObjectsByKeys(type, [...keys])] as const;
      }),
    );
    const byTypeAndKey = new Map<string, StoredObject>();
    for (const [type, resolved] of batches) {
      for (const object of resolved) {
        byTypeAndKey.set(`${type}::${object.primaryKey}`, object);
      }
    }

    let objects = links
      .map((link) =>
        byTypeAndKey.get(`${link.targetObjectType}::${link.targetPrimaryKey}`),
      )
      .filter((object): object is StoredObject => object !== undefined);
    if (orderBy) objects = applyOrderBy(objects, orderBy);

    const pageSize = parsePageSize(request.query.pageSize) ?? DEFAULT_PAGE_SIZE;
    const result = page(objects, cursorOf(request.query.pageToken), pageSize);
    return {
      data: applySelect(result.data, properties).map(toV1OntologyObject),
      ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
    };
  });

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  // Search objects.
  //
  // `SearchObjectsRequest` differs from its v2 counterpart in every field that
  // matters: the filter is `query` rather than `where` and uses the v1 filter
  // grammar, the projection is `fields` rather than `select`, and `orderBy`
  // nests its orderings under `fields`.
  app.post<{ Params: ListParams; Body: SearchBody }>(
    "/ontologies/:ontologyRid/objects/:objectType/search",
    { preHandler: requirePermission("objects:read") },
    async (request) => {
      const { ontologyRid, objectType } = request.params;
      const body = request.body ?? {};
      const fields = assertStringListBody("fields", body.fields);
      const orderBy = parseV1SearchOrderBy(body.orderBy);

      const declared = await declaredProperties(ontologyRid, objectType);
      assertPropertiesExist(objectType, declared, fields);
      assertPropertiesExist(objectType, declared, queryFields(body.query));
      assertPropertiesExist(
        objectType,
        declared,
        orderBy?.map((term) => term.property),
      );

      let objects = await store.allObjects(objectType);
      if (body.query) {
        objects = objects.filter((object) =>
          matchesV1Query(object.properties, body.query!),
        );
      }
      if (orderBy) objects = applyOrderBy(objects, orderBy);
      const totalCount = objects.length;

      const pageSize = parsePageSize(body.pageSize) ?? DEFAULT_PAGE_SIZE;
      const result = page(objects, cursorOf(body.pageToken), pageSize);
      return {
        data: applySelect(result.data, fields).map(toV1OntologyObject),
        totalCount,
        ...(result.nextPageToken ? { nextPageToken: result.nextPageToken } : {}),
      };
    },
  );

  // -----------------------------------------------------------------------
  // Aggregation
  // -----------------------------------------------------------------------

  // Aggregate objects.
  //
  // `AggregateObjectsResponse` has no `accuracy` field, and each
  // `AggregationMetricResult` is `{ name, value }` only — the v2 route emits a
  // `type` and a `field` alongside them, which v1 does not declare.
  app.post<{ Params: ListParams; Body: AggregateBody }>(
    "/ontologies/:ontologyRid/objects/:objectType/aggregate",
    { preHandler: requirePermission("objects:read") },
    async (request) => {
      const { ontologyRid, objectType } = request.params;
      const body = request.body ?? {};
      const aggregations = body.aggregation;
      if (!Array.isArray(aggregations) || aggregations.length === 0) {
        throw invalidArgument("aggregation", "must be a non-empty list");
      }

      for (const aggregation of aggregations) {
        if (!SUPPORTED_AGGREGATIONS.has(aggregation?.type)) {
          throw invalidArgument(
            "aggregation",
            `"${aggregation?.type}" is not implemented; supported: ${[...SUPPORTED_AGGREGATIONS.keys()].join(", ")}`,
          );
        }
      }

      // The query engine groups on the exact property value and nothing else.
      // `ranges`, `fixedWidth` and `duration` would silently become an exact
      // grouping, which answers a different question from the one asked.
      const groupBy = body.groupBy ?? [];
      if (!Array.isArray(groupBy)) {
        throw invalidArgument("groupBy", "must be a list of groupings");
      }
      for (const grouping of groupBy) {
        if (grouping?.type !== "exact") {
          throw invalidArgument(
            "groupBy",
            `grouping "${grouping?.type}" is not implemented; only "exact" is supported`,
          );
        }
      }

      const declared = await declaredProperties(ontologyRid, objectType);
      assertPropertiesExist(objectType, declared, queryFields(body.query));
      assertPropertiesExist(
        objectType,
        declared,
        aggregations
          .map((aggregation) => aggregation.field)
          .filter((field): field is string => typeof field === "string"),
      );
      assertPropertiesExist(
        objectType,
        declared,
        groupBy.map((grouping) => grouping.field),
      );

      let objects = await store.allObjects(objectType);
      if (body.query) {
        objects = objects.filter((object) =>
          matchesV1Query(object.properties, body.query!),
        );
      }

      // The engine keys its metrics by `name`, so two aggregations that omit
      // `name` and differ only in `field` would collide and report the last
      // one's value for both. The key is therefore the request position, which
      // is unique by construction; the caller still reads back the v1 name.
      const aggregationDefs: AggregationDef[] = aggregations.map(
        (aggregation, index) => ({
          type: SUPPORTED_AGGREGATIONS.get(aggregation.type)!,
          field: aggregation.field,
          name: String(index),
        }),
      );

      const results = queryEngine.aggregate(
        objects as unknown as Record<string, unknown>[],
        aggregationDefs,
        groupBy.length > 0
          ? groupBy.map((grouping) => ({ field: grouping.field, type: "exact" }))
          : undefined,
      );

      const data: V1AggregateObjectsResponseItem[] = results.map((result) => ({
        group: result.group,
        metrics: aggregations.map((aggregation, index) => ({
          name: aggregation.name ?? aggregation.type,
          value: result.metrics[String(index)],
        })),
      }));

      return { data };
    },
  );
}
