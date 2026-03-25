import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import { type DatasetServiceConfig, loadConfig } from "./config.js";
import { DatasetStore } from "./store/dataset-store.js";
import { FileStore } from "./store/file-store.js";
import { PipelineStore } from "./store/pipeline-store.js";
import { PgDatasetStore } from "./store/pg-dataset-store.js";
import { PgFileStore } from "./store/pg-file-store.js";
import { PgPipelineStore } from "./store/pg-pipeline-store.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: DatasetServiceConfig;
  /** Inject an existing dataset store (useful for tests). */
  datasetStore?: DatasetStore | PgDatasetStore;
  /** Inject an existing file store (useful for tests). */
  fileStore?: FileStore | PgFileStore;
  /** Inject an existing pipeline store (useful for tests). */
  pipelineStore?: PipelineStore | PgPipelineStore;
}

/**
 * Build and configure the Fastify server instance for the Dataset service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  let datasetStore: DatasetStore | PgDatasetStore;
  let fileStore: FileStore | PgFileStore;
  let pipelineStore: PipelineStore | PgPipelineStore;

  if (options.datasetStore && options.fileStore) {
    datasetStore = options.datasetStore;
    fileStore = options.fileStore;
    pipelineStore = options.pipelineStore ?? new PipelineStore();
  } else if (config.databaseUrl) {
    const pool = createPool({ connectionString: config.databaseUrl });
    datasetStore = options.datasetStore ?? new PgDatasetStore(pool);
    fileStore = options.fileStore ?? new PgFileStore(pool);
    pipelineStore = options.pipelineStore ?? new PgPipelineStore(pool);
  } else {
    datasetStore = options.datasetStore ?? new DatasetStore();
    fileStore = options.fileStore ?? new FileStore();
    pipelineStore = options.pipelineStore ?? new PipelineStore();
  }

  // Seed default pipeline definitions (no-op if pipelines already exist)
  if (pipelineStore instanceof PipelineStore) {
    pipelineStore.seedDefaults();
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
    datasetStore: datasetStore as DatasetStore,
    fileStore: fileStore as FileStore,
    pipelineStore: pipelineStore as PipelineStore,
  });

  return app;
}
