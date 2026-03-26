import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import { type ObjectsConfig, loadConfig } from "./config.js";
import { ObjectStore } from "./store/object-store.js";
import { PgObjectStore } from "./store/pg-object-store.js";
import { LinkStore } from "./store/link-store.js";
import { healthRoutes } from "./routes/health.js";
import { objectRoutes } from "./routes/v2/objects.js";
import { objectSetRoutes } from "./routes/v2/object-sets.js";
import { linkRoutes } from "./routes/v2/links.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  config?: ObjectsConfig;
  store?: ObjectStore | PgObjectStore;
  linkStore?: LinkStore;
}

/**
 * Build and configure the Fastify server for the Objects service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  let store: ObjectStore | PgObjectStore;
  if (options.store) {
    store = options.store;
  } else if (config.databaseUrl) {
    console.log("Using PostgreSQL storage (DATABASE_URL is set)");
    const pool = createPool({ connectionString: config.databaseUrl });
    store = new PgObjectStore(pool);
  } else {
    console.log("Using JSON file storage (DATABASE_URL is not set)");
    store = new ObjectStore();
  }

  const linkStore = options.linkStore ?? new LinkStore();

  const app = Fastify({
    logger: {
      level: config.logLevel,
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
  await app.register(healthRoutes);
  await app.register(objectRoutes, { prefix: "/api/v2", store: store as ObjectStore });
  await app.register(objectSetRoutes, { prefix: "/api/v2", store: store as ObjectStore, linkStore });
  await app.register(linkRoutes, { prefix: "/api/v2", linkStore, objectStore: store as ObjectStore });

  return app;
}
