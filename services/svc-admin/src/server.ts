import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import { PgPermissionStore } from "@openfoundry/permissions";
import { type AdminServiceConfig, loadConfig } from "./config.js";
import { UserStore } from "./store/user-store.js";
import { PgUserStore } from "./store/pg-user-store.js";
import { GroupStore } from "./store/group-store.js";
import { PgGroupStore } from "./store/pg-group-store.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: AdminServiceConfig;
  /** Inject an existing user store (useful for tests). */
  userStore?: UserStore | PgUserStore;
  /** Inject an existing group store (useful for tests). */
  groupStore?: GroupStore | PgGroupStore;
}

/**
 * Build and configure the Fastify server instance for the Admin service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  let userStore: UserStore | PgUserStore;
  let groupStore: GroupStore | PgGroupStore;
  let permissionStore: PgPermissionStore | undefined;

  if (options.userStore && options.groupStore) {
    userStore = options.userStore;
    groupStore = options.groupStore;
  } else if (config.databaseUrl) {
    const pool = createPool({ connectionString: config.databaseUrl });
    userStore = options.userStore ?? new PgUserStore(pool);
    groupStore = options.groupStore ?? new PgGroupStore(pool);
    permissionStore = new PgPermissionStore(pool);
  } else {
    userStore = options.userStore ?? new UserStore();
    groupStore = options.groupStore ?? new GroupStore();
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
  await app.register(healthRoutes);
  await app.register(v2Routes, {
    prefix: "/api/v2",
    userStore: userStore as UserStore,
    groupStore: groupStore as GroupStore,
    permissionStore,
  });

  return app;
}
