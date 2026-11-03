import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import pg from "pg";
import { PgSearchEngine } from "@openfoundry/search";
import type { SearchEntityType, SearchResult } from "@openfoundry/search";
import { permissionDenied } from "@openfoundry/errors";
import {
  PgAuthorizationStore,
  ROOT_RESOURCE,
  evaluate,
  evaluateEach,
  identityFromClaims,
  permissionsEnforced,
  type AuthorizationStore,
  type Identity,
} from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Shared pool — lazily initialised on first request.
// ---------------------------------------------------------------------------

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString:
        process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/openfoundry",
    });
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Search v2 routes
// ---------------------------------------------------------------------------

/** Entity types that are the platform's directory rather than a resource. */
const DIRECTORY_TYPES: ReadonlySet<string> = new Set(["USER", "GROUP"]);

/** What the search engine returns per call at most. */
const SCAN_PAGE = 100;

export interface SearchRouteOptions {
  /** The database holding the index, the object types and the grants. */
  pool?: pg.Pool;
  authorization?: AuthorizationStore;
}

/**
 * The caller the gateway verified. The gateway reads its own requests from
 * the token, never from `x-user-*` headers, which here are the client's.
 */
function callerOf(request: FastifyRequest): Identity | undefined {
  return request.claims ? identityFromClaims(request.claims as unknown as Record<string, unknown>) : undefined;
}

/**
 * Cross-entity search API routes.
 *
 * `GET  /api/v2/search?q=...&types=...&limit=...&offset=...`
 * `POST /api/v2/search/reindex`
 *
 * The index holds every entity, so a caller is shown only what the
 * permission model lets them discover: a resource, or an object type inside
 * its ontology, with every Organization and Marking on the way; users and
 * groups only to whoever administers the platform.
 */
export async function searchRoutes(app: FastifyInstance, options: SearchRouteOptions = {}): Promise<void> {
  const db = options.pool ?? getPool();
  const engine = new PgSearchEngine(db);
  const authorization = options.authorization ?? new PgAuthorizationStore(db);

  async function visible(identity: Identity, results: readonly SearchResult[]): Promise<SearchResult[]> {
    const objectTypes = results.filter((r) => r.entityType === "OBJECT_TYPE").map((r) => r.rid);
    const ontologyOf = new Map<string, string>();
    if (objectTypes.length > 0) {
      const { rows } = await db.query<{ rid: string; ontology_rid: string }>(
        "SELECT rid, ontology_rid FROM object_types WHERE rid = ANY($1)",
        [objectTypes],
      );
      for (const row of rows) ontologyOf.set(row.rid, row.ontology_rid);
    }
    const resources = results.filter((r) => !DIRECTORY_TYPES.has(r.entityType));
    const allowed = await evaluateEach(
      authorization,
      identity,
      "resource:discover",
      resources.map((r) => {
        const ontology = ontologyOf.get(r.rid);
        return ontology ? [r.rid, ontology] : [r.rid];
      }),
    );
    const shown = new Set(resources.filter((_, i) => allowed[i]));
    const administers =
      results.some((r) => DIRECTORY_TYPES.has(r.entityType)) &&
      (await evaluate(authorization, identity, "admin:manage", [ROOT_RESOURCE])) === undefined;
    return results.filter((r) => shown.has(r) || (administers && DIRECTORY_TYPES.has(r.entityType)));
  }

  // -----------------------------------------------------------------------
  // GET /search — full-text search across all entities
  // -----------------------------------------------------------------------

  app.get(
    "/",
    async (
      request: FastifyRequest<{
        Querystring: {
          q?: string;
          types?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const q = request.query.q?.trim() ?? "";
      if (!q) {
        return reply.status(400).send({
          errorCode: "INVALID_ARGUMENT",
          errorName: "Search:InvalidQuery",
          errorInstanceId: "",
          parameters: { reason: "Query parameter 'q' is required and must not be empty." },
        });
      }

      const typesParam = request.query.types?.trim() ?? "";
      const entityTypes: SearchEntityType[] | undefined = typesParam
        ? (typesParam.split(",").map((t) => t.trim()) as SearchEntityType[])
        : undefined;

      const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;
      const offset = request.query.offset ? parseInt(request.query.offset, 10) : undefined;

      const identity = callerOf(request);
      if (!identity) {
        if (permissionsEnforced()) throw permissionDenied("platform", "resource:discover");
        return reply.send(await engine.search({ query: q, entityTypes, limit, offset }));
      }

      // Filter before paging, so a page and the total count only ever cover
      // what this caller may see.
      const start = Date.now();
      const matches: SearchResult[] = [];
      for (let page = 0; ; page++) {
        const { results } = await engine.search({
          query: q,
          entityTypes,
          limit: SCAN_PAGE,
          offset: page * SCAN_PAGE,
        });
        matches.push(...results);
        if (results.length < SCAN_PAGE) break;
      }
      const shown = await visible(identity, matches);
      const from = Math.max(offset || 0, 0);
      const size = Math.min(Math.max(limit || 20, 1), SCAN_PAGE);
      return reply.send({
        results: shown.slice(from, from + size),
        totalCount: shown.length,
        query: q,
        durationMs: Date.now() - start,
      });
    },
  );

  // -----------------------------------------------------------------------
  // POST /search/reindex — rebuild the entire search index
  // -----------------------------------------------------------------------

  app.post(
    "/reindex",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const identity = callerOf(request);
      const denied = identity
        ? (await evaluate(authorization, identity, "admin:manage", [ROOT_RESOURCE])) !== undefined
        : permissionsEnforced();
      if (denied) throw permissionDenied(ROOT_RESOURCE, "admin:manage");
      const result = await engine.reindexAll();
      return reply.send(result);
    },
  );
}
