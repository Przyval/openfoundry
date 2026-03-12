import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import { type SentinelServiceConfig, loadConfig } from "./config.js";
import { MonitorStore } from "./store/monitor-store.js";
import { ExecutionLog } from "./store/execution-log.js";
import { NotificationStore } from "./store/notification-store.js";
import { PgMonitorStore } from "./store/pg-monitor-store.js";
import { PgExecutionLog } from "./store/pg-execution-log.js";
import { EffectExecutor } from "./effects/effect-executor.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: SentinelServiceConfig;
  /** Inject an existing monitor store (useful for tests). */
  monitorStore?: MonitorStore | PgMonitorStore;
  /** Inject an existing execution log (useful for tests). */
  executionLog?: ExecutionLog | PgExecutionLog;
  /** Inject an existing notification store (useful for tests). */
  notificationStore?: NotificationStore;
  /** Inject an existing effect executor (useful for tests). */
  effectExecutor?: EffectExecutor;
}

/**
 * Build and configure the Fastify server instance for the Sentinel service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  let monitorStore: MonitorStore | PgMonitorStore;
  let executionLog: ExecutionLog | PgExecutionLog;

  if (options.monitorStore && options.executionLog) {
    monitorStore = options.monitorStore;
    executionLog = options.executionLog;
  } else if (config.databaseUrl) {
    const pool = createPool({ connectionString: config.databaseUrl });
    monitorStore = options.monitorStore ?? new PgMonitorStore(pool);
    executionLog = options.executionLog ?? new PgExecutionLog(pool);
  } else {
    monitorStore = options.monitorStore ?? new MonitorStore();
    executionLog = options.executionLog ?? new ExecutionLog();
  }

  const notificationStore = options.notificationStore ?? new NotificationStore();
  const effectExecutor = options.effectExecutor ?? new EffectExecutor(notificationStore);

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
    monitorStore: monitorStore as MonitorStore,
    executionLog: executionLog as ExecutionLog,
    notificationStore,
    effectExecutor,
  });

  return app;
}
