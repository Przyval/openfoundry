import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import pg from "pg";
import { PgSearchEngine } from "@openfoundry/search";
import type { SearchEntityType } from "@openfoundry/search";

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

/**
 * Cross-entity search API routes.
 *
 * `GET  /api/v2/search?q=...&types=...&limit=...&offset=...`
 * `POST /api/v2/search/reindex`
 */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  const engine = new PgSearchEngine(getPool());

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

      const response = await engine.search({
        query: q,
        entityTypes,
        limit,
        offset,
      });

      return reply.send(response);
    },
  );

  // -----------------------------------------------------------------------
  // POST /search/reindex — rebuild the entire search index
  // -----------------------------------------------------------------------

  app.post(
    "/reindex",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await engine.reindexAll();
      return reply.send(result);
    },
  );
}
