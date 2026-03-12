import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { metricsPlugin } from "@openfoundry/health";
import { type GatewayConfig, loadConfig } from "./config.js";
import { authPlugin } from "./middleware/auth.js";
import { rateLimitPlugin } from "./rate-limiter.js";
import { healthRoutes } from "./routes/health.js";
import { v2Routes } from "./routes/v2/index.js";
import { multipassRoutes } from "./routes/multipass.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: GatewayConfig;
}

/**
 * Build and configure the Fastify server instance.
 *
 * Registers, in order:
 * 1. CORS
 * 2. Helmet (security headers, HSTS)
 * 3. Rate limiting (token bucket)
 * 4. X-Request-Id middleware
 * 5. Structured JSON error handler
 * 6. Auth middleware (Bearer JWT)
 * 7. Health-check routes
 * 8. API v2 routes
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Structured JSON logging — no pretty-printing in production
      ...(config.nodeEnv === "development"
        ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss Z" } } }
        : {}),
    },
    // Use Fastify's built-in request ID generation as a baseline;
    // our plugin adds the header propagation layer on top.
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: "x-request-id",
  });

  // -- CORS ---------------------------------------------------------------
  await app.register(cors, {
    origin: true, // reflect request origin (configure per-environment in production)
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Request-Id",
      "Accept",
    ],
    exposedHeaders: ["X-Request-Id"],
  });

  // -- Helmet (security headers) ------------------------------------------
  await app.register(helmet, {
    contentSecurityPolicy: false, // API-only, no HTML to protect
    hsts: {
      maxAge: 63_072_000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
  });

  // -- Rate limiting -------------------------------------------------------
  // Registered directly (not via app.register) so hooks apply across all
  // encapsulated route contexts — same pattern as the X-Request-Id hook.
  if (config.rateLimit.enabled) {
    await rateLimitPlugin(app, {
      config: {
        maxRequests: config.rateLimit.maxRequests,
        windowMs: config.rateLimit.windowMs,
      },
      redisUrl: process.env.REDIS_URL,
    });
  }

  // -- Request ID ---------------------------------------------------------
  // Add directly on root instance (not via register) so the hook applies
  // across all encapsulated route contexts.
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

    // Fastify validation errors (schema validation)
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

    // Unexpected errors — log full details, return opaque 500
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

  // -- Metrics collection ----------------------------------------------------
  await app.register(metricsPlugin);

  // -- Auth middleware -----------------------------------------------------
  await app.register(authPlugin, { config });

  // -- Config decorator (available to all route plugins) -------------------
  app.decorate("config", config);

  // -- Routes -------------------------------------------------------------
  await app.register(healthRoutes);
  await app.register(v2Routes, { prefix: "/api/v2", config });
  await app.register(multipassRoutes, { prefix: "/multipass" });

  return app;
}
