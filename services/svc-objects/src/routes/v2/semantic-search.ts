import type { FastifyInstance } from "fastify";
import { invalidArgument } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SemanticSearchRouteOptions {
  aipServiceUrl: string;
}

interface SemanticSearchBody {
  query: string;
  objectType?: string;
  limit?: number;
}

interface SemanticSearchResult {
  primaryKey: string;
  objectType: string;
  properties: Record<string, unknown>;
  score: number;
}

interface AipSemanticSearchResponse {
  results: Array<{
    rid: string;
    objectType: string;
    score: number;
    properties: Record<string, unknown>;
  }>;
}

// ---------------------------------------------------------------------------
// Semantic Search routes  (Feature 8)
// ---------------------------------------------------------------------------

/**
 * Semantic search routes — proxies vector similarity queries to svc-aip
 * and returns matched objects with relevance scores.
 */
export async function semanticSearchRoutes(
  app: FastifyInstance,
  opts: SemanticSearchRouteOptions,
): Promise<void> {
  const { aipServiceUrl } = opts;

  // -----------------------------------------------------------------------
  // POST /ontologies/:ontologyRid/objects/semantic-search
  // -----------------------------------------------------------------------
  app.post<{
    Params: { ontologyRid: string };
    Body: SemanticSearchBody;
  }>(
    "/ontologies/:ontologyRid/objects/semantic-search",
    async (request, reply) => {
      const { ontologyRid } = request.params;
      const { query, objectType, limit } =
        request.body ?? ({} as SemanticSearchBody);

      if (!query) {
        throw invalidArgument("query", "is required");
      }

      const searchLimit = limit ?? 10;

      try {
        // Build the payload for svc-aip
        const aipPayload: Record<string, unknown> = {
          query,
          limit: searchLimit,
        };
        if (objectType) {
          aipPayload.objectType = objectType;
        }

        const aipUrl = `${aipServiceUrl}/api/v2/aip/semantic-search`;

        const response = await fetch(aipUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(aipPayload),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          request.log.error(
            { statusCode: response.status, body: errorText },
            "AIP semantic-search proxy failed",
          );
          return reply.status(502).send({
            errorCode: "UPSTREAM_ERROR",
            errorName: "AipServiceError",
            errorInstanceId: crypto.randomUUID(),
            parameters: {
              upstream: aipUrl,
              statusCode: response.status,
            },
            statusCode: 502,
          });
        }

        const aipData = (await response.json()) as AipSemanticSearchResponse;

        // Map AIP results to the expected object format
        const results: SemanticSearchResult[] = (aipData.results ?? [])
          .filter((r) => {
            // If objectType filter is specified, only include matching results
            if (objectType && r.objectType !== objectType) {
              return false;
            }
            return true;
          })
          .slice(0, searchLimit)
          .map((r) => ({
            primaryKey: r.rid,
            objectType: r.objectType,
            properties: r.properties,
            score: r.score,
          }));

        return reply.status(200).send({
          ontologyRid,
          results,
        });
      } catch (err: unknown) {
        // Network errors (svc-aip unreachable, etc.)
        if (err instanceof TypeError && (err as Error).message.includes("fetch")) {
          request.log.error({ err }, "Failed to connect to AIP service");
          return reply.status(503).send({
            errorCode: "SERVICE_UNAVAILABLE",
            errorName: "AipServiceUnavailable",
            errorInstanceId: crypto.randomUUID(),
            parameters: { aipServiceUrl },
            statusCode: 503,
          });
        }

        const message = err instanceof Error ? err.message : "Unknown error";
        request.log.error({ err }, "Semantic search failed");
        return reply.status(500).send({
          errorCode: "INTERNAL",
          errorName: "InternalError",
          errorInstanceId: crypto.randomUUID(),
          parameters: { detail: message },
          statusCode: 500,
        });
      }
    },
  );
}
