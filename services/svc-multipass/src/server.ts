import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { createPool } from "@openfoundry/db";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { type MultipassConfig, loadConfig } from "./config.js";
import { resolveSigningKeys, type SigningKey } from "./keys.js";
import { healthRoutes } from "./routes/health.js";
import { oauthRoutes, type OAuthRoutesOptions } from "./routes/oauth.js";
import { authRoutes, type AuthRoutesOptions } from "./routes/auth.js";
import { createClientStore, parseDeclaredClients, type ClientStore } from "./store/client-store.js";
import { PgUserStore } from "./store/pg-user-store.js";
import type { TokenStore } from "./store/token-store.js";
import { createUserDirectory, type UserDirectory } from "./store/user-store.js";

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface CreateServerOptions {
  /** Override the config (useful for tests). */
  config?: MultipassConfig;
  /** Override OAuth stores and keys (useful for tests). */
  oauthOptions?: {
    tokenStore?: TokenStore;
    clientStore?: ClientStore;
    privateKey?: SigningKey;
    publicKey?: SigningKey;
  };
  /**
   * Override the user directory (useful for tests). By default it is built
   * from the config: the development accounts outside production, and the
   * `users` table when DATABASE_URL is set.
   */
  users?: UserDirectory;
}

/**
 * Build and configure the Fastify server instance.
 *
 * Registers, in order:
 * 1. CORS
 * 2. X-Request-Id middleware
 * 3. Structured JSON error handler
 * 4. Health-check routes
 * 5. OAuth2 routes, including the /authorize sign-in page
 * 6. Password login and account routes
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

  // -- Form body parser (the OAuth2 token endpoint and the sign-in form post
  // application/x-www-form-urlencoded). URLSearchParams decodes `+` as a
  // space and keeps any `=` inside a value, as HTML forms require.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    function (_request, body, done) {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
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
  const overrides = options.oauthOptions ?? {};
  const keys =
    overrides.privateKey && overrides.publicKey
      ? { privateKey: overrides.privateKey, publicKey: overrides.publicKey }
      : await resolveSigningKeys(config, app.log);

  // Parsed before anything listens, so a malformed OAUTH_CLIENTS stops the
  // service rather than leaving a client nobody can sign in through.
  const clientStore =
    overrides.clientStore ??
    createClientStore({
      nodeEnv: config.nodeEnv,
      declared: parseDeclaredClients(config.oauthClients),
    });

  let users = options.users;
  if (!users) {
    let persistent: UserDirectory | undefined;
    if (config.databaseUrl) {
      const pool = createPool({ connectionString: config.databaseUrl, maxConnections: 5 });
      app.addHook("onClose", async () => {
        await pool.end();
      });
      persistent = new PgUserStore(pool);
    } else if (config.nodeEnv === "production") {
      app.log.warn(
        "DATABASE_URL is not set, so there are no user accounts: nobody can sign in.",
      );
    }
    users = await createUserDirectory({ nodeEnv: config.nodeEnv, persistent });
  }

  await app.register(healthRoutes);
  await app.register(oauthRoutes, {
    config,
    tokenStore: overrides.tokenStore,
    clientStore,
    users,
    ...keys,
  } satisfies OAuthRoutesOptions);
  await app.register(authRoutes, {
    config,
    users,
    privateKey: keys.privateKey,
  } satisfies AuthRoutesOptions);

  return app;
}
