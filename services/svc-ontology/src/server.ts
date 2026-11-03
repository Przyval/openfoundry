import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import {
  createAuthorizationStore,
  registerAuthorization,
  type AuthorizationStore,
} from "@openfoundry/permissions";
import { type OntologyServiceConfig, loadConfig } from "./config.js";
import { OntologyStore, type StoredOntology } from "./store/ontology-store.js";
import { PgOntologyStore } from "./store/pg-ontology-store.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";
import { v1Routes } from "./routes/v1/index.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Inject the grant and policy store (useful for tests). */
  authorizationStore?: AuthorizationStore;
  /** Override the config (useful for tests). */
  config?: OntologyServiceConfig;
  /** Inject an existing store (useful for tests). */
  store?: OntologyStore | PgOntologyStore;
}

/**
 * Build and configure the Fastify server instance for the Ontology service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  let authPool: ReturnType<typeof createPool> | undefined;

  let store: OntologyStore | PgOntologyStore;
  if (options.store) {
    store = options.store;
  } else if (config.databaseUrl) {
    console.log("Using PostgreSQL storage (DATABASE_URL is set)");
    const pool = createPool({ connectionString: config.databaseUrl });
    authPool = pool;
    store = new PgOntologyStore(pool);
  } else {
    console.log("Using JSON file storage (DATABASE_URL is not set)");
    store = new OntologyStore();
  }

  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.nodeEnv === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss Z" },
            },
          }
        : {}),
    },
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: "x-request-id",
  });

  // -- CORS ---------------------------------------------------------------
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id", "Accept"],
    exposedHeaders: ["X-Request-Id"],
  });

  // -- Request ID ---------------------------------------------------------
  app.addHook("onSend", async (request, reply) => {
    if (!reply.hasHeader("x-request-id")) {
      reply.header("x-request-id", request.id);
    }
  });

  // -- Error handler ------------------------------------------------------
  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof OpenFoundryApiError) {
      request.log.warn(
        { err: error.toJSON(), requestId: request.id },
        error.message,
      );
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify validation errors
    const fastifyError = error as Error & { validation?: unknown[] };
    if (fastifyError.validation) {
      const body = {
        errorCode: "INVALID_ARGUMENT",
        errorName: "ValidationError",
        errorInstanceId: crypto.randomUUID(),
        parameters: { validationErrors: fastifyError.validation },
        statusCode: 400,
      };
      request.log.warn({ err: body, requestId: request.id }, error.message);
      return reply.status(400).send(body);
    }

    // Unexpected errors
    request.log.error(
      { err: error, requestId: request.id },
      "Unhandled error",
    );
    return reply.status(500).send({
      errorCode: "INTERNAL",
      errorName: "InternalError",
      errorInstanceId: crypto.randomUUID(),
      parameters: {},
      statusCode: 500,
    });
  });

  // -- Routes -------------------------------------------------------------
  registerAuthorization(app, {
    store: options.authorizationStore ?? createAuthorizationStore(authPool),
    // Routes accept an ontology's API name where its RID goes.
    alias: async (identifier) => {
      if (identifier.startsWith("ri.")) return undefined;
      const listed = await store.listOntologies();
      const all = Array.isArray(listed) ? listed : ((listed as { items?: StoredOntology[] }).items ?? []);
      return all.find((o) => o.apiName === identifier)?.rid;
    },
  });

  await app.register(healthRoutes);
  await app.register(v2Routes, { prefix: "/api/v2", store: store as OntologyStore });
  await app.register(v1Routes, { prefix: "/api/v1", store: store as OntologyStore });

  return app;
}
