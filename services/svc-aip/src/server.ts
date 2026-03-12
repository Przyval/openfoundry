import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createPool } from "@openfoundry/db";
import { type AipServiceConfig, loadConfig } from "./config.js";
import { ConversationStore } from "./store/conversation-store.js";
import { EmbeddingStore } from "./store/embedding-store.js";
import { PgConversationStore } from "./store/pg-conversation-store.js";
import { PgEmbeddingStore } from "./store/pg-embedding-store.js";
import type { LlmClient } from "./llm/llm-client.js";
import { createLlmClient } from "./llm/create-client.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: AipServiceConfig;
  /** Inject an LLM client (useful for tests). */
  llmClient?: LlmClient;
  /** Inject a conversation store (useful for tests). */
  conversationStore?: ConversationStore | PgConversationStore;
  /** Inject an embedding store (useful for tests). */
  embeddingStore?: EmbeddingStore | PgEmbeddingStore;
}

/**
 * Build and configure the Fastify server instance for the AIP service.
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  // -- Stores ---------------------------------------------------------------
  let conversationStore: ConversationStore | PgConversationStore;
  let embeddingStore: EmbeddingStore | PgEmbeddingStore;

  if (options.conversationStore && options.embeddingStore) {
    conversationStore = options.conversationStore;
    embeddingStore = options.embeddingStore;
  } else if (config.databaseUrl) {
    const pool = createPool({ connectionString: config.databaseUrl });
    conversationStore = new PgConversationStore(pool);
    embeddingStore = new PgEmbeddingStore(pool);
  } else {
    conversationStore = new ConversationStore();
    embeddingStore = new EmbeddingStore();
  }

  // -- LLM client -----------------------------------------------------------
  const llmClient: LlmClient = options.llmClient ?? createLlmClient({
    provider: config.llmProvider as "openai" | "anthropic" | "ollama" | "mock" | undefined,
    apiKey: config.llmApiKey || undefined,
    baseUrl: config.llmBaseUrl || undefined,
    model: config.llmModel || undefined,
    embeddingModel: config.embeddingModel || undefined,
  });

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
    llmClient,
    conversationStore,
    embeddingStore,
  });

  return app;
}
