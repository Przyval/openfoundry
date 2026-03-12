import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import { type ActionsConfig, loadConfig } from "./config.js";
import { ActionRegistry } from "./store/action-registry.js";
import { ActionLog } from "./store/action-log.js";
import { PgActionRegistry } from "./store/pg-action-registry.js";
import { PgActionLog } from "./store/pg-action-log.js";
import { healthRoutes } from "./routes/health.js";
import { actionRoutes } from "./routes/v2/actions.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: ActionsConfig;

  /** Provide a pre-populated registry (useful for tests). */
  registry?: ActionRegistry | PgActionRegistry;

  /** Provide a pre-populated action log (useful for tests). */
  actionLog?: ActionLog | PgActionLog;
}

/**
 * Build and configure the Fastify server instance for the Actions service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  let registry: ActionRegistry | PgActionRegistry;
  let actionLog: ActionLog | PgActionLog;

  if (options.registry && options.actionLog) {
    registry = options.registry;
    actionLog = options.actionLog;
  } else if (config.databaseUrl) {
    const pool = createPool({ connectionString: config.databaseUrl });
    registry = options.registry ?? new PgActionRegistry(pool);
    actionLog = options.actionLog ?? new PgActionLog(pool);
  } else {
    registry = options.registry ?? new ActionRegistry();
    actionLog = options.actionLog ?? new ActionLog();
  }

  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.nodeEnv === "development"
        ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss Z" } } }
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
  await app.register(actionRoutes, {
    prefix: "/api/v2",
    registry: registry as ActionRegistry,
    log: actionLog as ActionLog,
  });

  return app;
}
