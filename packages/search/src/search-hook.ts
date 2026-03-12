import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SearchEngine, IndexableEntity, SearchEntityType } from "./types.js";

// ---------------------------------------------------------------------------
// Augment Fastify with the search engine
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyInstance {
    searchEngine: SearchEngine;
  }
}

// ---------------------------------------------------------------------------
// Entity extraction helpers
// ---------------------------------------------------------------------------

interface EntityMapping {
  /** URL pattern to match (method agnostic). */
  pattern: RegExp;
  /** HTTP methods that trigger indexing. */
  methods: string[];
  /** Extract an IndexableEntity from the response body. */
  extract: (body: Record<string, unknown>) => IndexableEntity | null;
}

const ENTITY_MAPPINGS: EntityMapping[] = [
  {
    pattern: /\/ontologies(\/|$)/,
    methods: ["POST", "PUT"],
    extract: (body) =>
      body.rid
        ? {
            rid: body.rid as string,
            entityType: "ONTOLOGY" as SearchEntityType,
            title: (body.displayName ?? body.apiName ?? body.rid) as string,
            description: body.description as string | undefined,
          }
        : null,
  },
  {
    pattern: /\/datasets(\/|$)/,
    methods: ["POST", "PUT"],
    extract: (body) =>
      body.rid
        ? {
            rid: body.rid as string,
            entityType: "DATASET" as SearchEntityType,
            title: (body.name ?? body.rid) as string,
          }
        : null,
  },
  {
    pattern: /\/functions(\/|$)/,
    methods: ["POST", "PUT"],
    extract: (body) =>
      body.rid
        ? {
            rid: body.rid as string,
            entityType: "FUNCTION" as SearchEntityType,
            title: (body.displayName ?? body.apiName ?? body.rid) as string,
            description: body.description as string | undefined,
          }
        : null,
  },
  {
    pattern: /\/actions(\/|$)/,
    methods: ["POST", "PUT"],
    extract: (body) =>
      body.rid
        ? {
            rid: body.rid as string,
            entityType: "ACTION" as SearchEntityType,
            title: (body.displayName ?? body.apiName ?? body.rid) as string,
          }
        : null,
  },
];

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Fastify plugin that intercepts responses to entity mutation endpoints and
 * updates the search index accordingly.
 *
 * Register this plugin *after* decorating the instance with `searchEngine`.
 */
export const searchHookPlugin = fp(
  async (app: FastifyInstance) => {
    app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      // Only process successful mutations.
      if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;

      const method = request.method.toUpperCase();
      const url = request.url;

      // Handle DELETE — remove from index.
      if (method === "DELETE") {
        const ridMatch = url.match(/\/([^/]+)$/);
        if (ridMatch) {
          const rid = decodeURIComponent(ridMatch[1]);
          try {
            await app.searchEngine.removeEntity(rid);
          } catch {
            // Swallow indexing errors — search is best-effort.
            app.log.warn({ rid }, "Failed to remove entity from search index");
          }
        }
        return payload;
      }

      // Handle POST/PUT — index the entity.
      for (const mapping of ENTITY_MAPPINGS) {
        if (!mapping.methods.includes(method)) continue;
        if (!mapping.pattern.test(url)) continue;

        try {
          const body =
            typeof payload === "string" ? (JSON.parse(payload) as Record<string, unknown>) : null;
          if (!body) continue;

          const entity = mapping.extract(body);
          if (entity) {
            await app.searchEngine.indexEntity(entity);
          }
        } catch {
          // Swallow indexing errors — search is best-effort.
          app.log.warn({ url, method }, "Failed to index entity from response");
        }
        break;
      }

      return payload;
    });
  },
  { name: "@openfoundry/search-hook", fastify: "5.x" },
);
