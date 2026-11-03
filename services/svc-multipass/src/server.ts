import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type pg from "pg";
import { createPool } from "@openfoundry/db";
import {
  createAuthorizationStore,
  type AuthorizationStore,
  type RoleId,
} from "@openfoundry/permissions";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { type MultipassConfig, loadConfig } from "./config.js";
import { resolveSigningKeys, type SigningKey } from "./keys.js";
import { healthRoutes } from "./routes/health.js";
import { oauthRoutes, type OAuthRoutesOptions } from "./routes/oauth.js";
import { authRoutes, type AuthRoutesOptions } from "./routes/auth.js";
import { createClientStore, parseDeclaredClients, type ClientStore } from "./store/client-store.js";
import { PgUserStore } from "./store/pg-user-store.js";
import type { TokenStore } from "./store/token-store.js";
import {
  createUserDirectory,
  legacyRolesWarning,
  syncLegacyRootGrants,
  type UserDirectory,
} from "./store/user-store.js";

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
  /**
   * Override where legacy client roles are granted (useful for tests). By
   * default the database when DATABASE_URL is set, else the shared file.
   */
  authorizationStore?: AuthorizationStore;
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
  const declared = overrides.clientStore ? [] : parseDeclaredClients(config.oauthClients);
  const clientStore =
    overrides.clientStore ?? createClientStore({ nodeEnv: config.nodeEnv, declared });

  let pool: pg.Pool | undefined;
  const sharedPool = (): pg.Pool | undefined => {
    if (!config.databaseUrl) return undefined;
    if (!pool) {
      const opened = createPool({ connectionString: config.databaseUrl, maxConnections: 5 });
      app.addHook("onClose", async () => {
        await opened.end();
      });
      pool = opened;
    }
    return pool;
  };

  // A legacy EDITOR or VIEWER on a declared client becomes that role on the
  // platform root, where the permission model looks for it; one no longer
  // declared is taken back.
  if (!overrides.clientStore) {
    const authorization = options.authorizationStore ?? createAuthorizationStore(sharedPool());
    const desired = new Map<string, readonly RoleId[]>();
    for (const client of declared) {
      if (!client.rootRoles || client.rootRoles.length === 0) continue;
      app.log.warn(legacyRolesWarning(`OAUTH_CLIENTS client "${client.clientId}"`, client.legacyRoles ?? []));
      desired.set(`service:${client.clientId}`, client.rootRoles);
    }
    await syncLegacyRootGrants(authorization, (id) => id.startsWith("service:"), desired);
  }

  let users = options.users;
  if (!users) {
    const db = sharedPool();
    if (!db && config.nodeEnv === "production") {
      app.log.warn(
        "DATABASE_URL is not set, so there are no user accounts: nobody can sign in.",
      );
    }
    users = await createUserDirectory({
      nodeEnv: config.nodeEnv,
      persistent: db ? new PgUserStore(db) : undefined,
    });
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
