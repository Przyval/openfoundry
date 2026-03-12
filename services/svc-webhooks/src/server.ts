import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import { type WebhooksServiceConfig, loadConfig } from "./config.js";
import { WebhookStore } from "./store/webhook-store.js";
import { DeliveryLog } from "./store/delivery-log.js";
import { PgWebhookStore } from "./store/pg-webhook-store.js";
import { PgDeliveryLog } from "./store/pg-delivery-log.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: WebhooksServiceConfig;
  /** Inject an existing webhook store (useful for tests). */
  webhookStore?: WebhookStore | PgWebhookStore;
  /** Inject an existing delivery log (useful for tests). */
  deliveryLog?: DeliveryLog | PgDeliveryLog;
}

/**
 * Build and configure the Fastify server instance for the Webhooks service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  let webhookStore: WebhookStore | PgWebhookStore;
  let deliveryLog: DeliveryLog | PgDeliveryLog;

  if (options.webhookStore && options.deliveryLog) {
    webhookStore = options.webhookStore;
    deliveryLog = options.deliveryLog;
  } else if (config.databaseUrl) {
    const pool = createPool({ connectionString: config.databaseUrl });
    webhookStore = options.webhookStore ?? new PgWebhookStore(pool);
    deliveryLog = options.deliveryLog ?? new PgDeliveryLog(pool);
  } else {
    webhookStore = options.webhookStore ?? new WebhookStore();
    deliveryLog = options.deliveryLog ?? new DeliveryLog();
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
    webhookStore: webhookStore as WebhookStore,
    deliveryLog: deliveryLog as DeliveryLog,
  });

  return app;
}
