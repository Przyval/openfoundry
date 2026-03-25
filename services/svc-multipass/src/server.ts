import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { type MultipassConfig, loadConfig } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { oauthRoutes, type OAuthRoutesOptions } from "./routes/oauth.js";
import { authRoutes, type AuthRoutesOptions } from "./routes/auth.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: MultipassConfig;
  /** Override OAuth route options (useful for tests to inject keys/stores). */
  oauthOptions?: Partial<OAuthRoutesOptions>;
}

/**
 * Build and configure the Fastify server instance.
 *
 * Registers, in order:
 * 1. CORS
 * 2. X-Request-Id middleware
 * 3. Structured JSON error handler
 * 4. Health-check routes
 * 5. OAuth2 routes
 */
export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

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
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Request-Id",
      "Accept",
    ],
    exposedHeaders: ["X-Request-Id"],
  });

  // -- Form body parser (OAuth2 token endpoint requires application/x-www-form-urlencoded) --
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    function (_request, payload, done) {
      let body = "";
      payload.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      payload.on("end", () => {
        try {
          const parsed: Record<string, string> = {};
          for (const pair of body.split("&")) {
            const [key, value] = pair.split("=");
            if (key) {
              parsed[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
            }
          }
          done(null, parsed);
        } catch (err) {
          done(err as Error, undefined);
        }
      });
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

  // -- Routes -------------------------------------------------------------
  await app.register(healthRoutes);
  await app.register(oauthRoutes, {
    config,
    ...options.oauthOptions,
  } as OAuthRoutesOptions);
  await app.register(authRoutes, { config } as AuthRoutesOptions);

  return app;
}
