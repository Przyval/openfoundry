import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { type MediaServiceConfig, loadConfig } from "./config.js";
import { MediaStore, type IMediaStore } from "./store/media-store.js";
import { S3MediaStore, type S3Config } from "./store/s3-media-store.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";

// ---------------------------------------------------------------------------
// S3 config loader
// ---------------------------------------------------------------------------

function loadS3Config(): S3Config | undefined {
  const bucket = process.env["S3_BUCKET"];
  const endpoint = process.env["S3_ENDPOINT"];

  // S3 is opt-in: at least the bucket must be configured
  if (!bucket && !endpoint) return undefined;
  if (!bucket) return undefined;

  return {
    endpoint: endpoint || undefined,
    region: process.env["S3_REGION"] ?? "us-east-1",
    bucket,
    accessKeyId: process.env["S3_ACCESS_KEY_ID"] ?? process.env["AWS_ACCESS_KEY_ID"] ?? "",
    secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"] ?? process.env["AWS_SECRET_ACCESS_KEY"] ?? "",
    forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true" || !!endpoint,
  };
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: MediaServiceConfig;
  /** Inject an existing store (useful for tests). */
  store?: IMediaStore;
}

/**
 * Build and configure the Fastify server instance for the Media service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  let store: IMediaStore;
  if (options.store) {
    store = options.store;
  } else {
    const s3Config = loadS3Config();
    store = s3Config ? new S3MediaStore(s3Config) : new MediaStore();
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
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id", "Accept", "X-Filename", "X-Uploaded-By"],
    exposedHeaders: ["X-Request-Id"],
  });

  // -- Raw body for uploads -----------------------------------------------
  app.addContentTypeParser(
    ["application/octet-stream", "image/png", "image/jpeg", "image/gif", "application/pdf", "text/plain"],
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    },
  );

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
  await app.register(v2Routes, { prefix: "/api/v2", store });

  return app;
}
