import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  validateToken,
  importVerificationKey,
  TokenValidationError,
  type OpenFoundryClaims,
  type ValidateTokenOptions,
  isOpenSignupEnabled,
} from "@openfoundry/auth-tokens";
import { OpenFoundryApiError, ErrorCode } from "@openfoundry/errors";
import type { GatewayConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Augment FastifyRequest so downstream handlers can access `.claims`
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    claims?: OpenFoundryClaims;
    /** Tenant organization RID, extracted from JWT `org` claim. */
    orgRid?: string;
  }
}

// ---------------------------------------------------------------------------
// Route patterns that bypass authentication
// ---------------------------------------------------------------------------

const SKIP_AUTH_PREFIXES = [
  "/status/",
  "/multipass/api/oauth2/",
  "/multipass/api/auth/login",
];

const OPEN_SIGNUP_PREFIX = "/api/v2/auth/signup";

function shouldSkipAuth(url: string): boolean {
  if (SKIP_AUTH_PREFIXES.some((prefix) => url.startsWith(prefix))) return true;
  return isOpenSignupEnabled() && url.startsWith(OPEN_SIGNUP_PREFIX);
}

// ---------------------------------------------------------------------------
// Bearer token extraction
// ---------------------------------------------------------------------------

const BEARER_RE = /^Bearer\s+(\S+)$/;

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string") return null;
  const match = BEARER_RE.exec(header);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface AuthPluginOptions {
  config: GatewayConfig;
}

/**
 * Verify Bearer JWT tokens on incoming requests.
 *
 * Call this DIRECTLY on the root instance - `await authPlugin(app, ...)` -
 * never through `app.register`. Registering it gives it its own encapsulated
 * context, and an `onRequest` hook added inside that context runs only for
 * routes registered inside it too. The route plugins are siblings registered
 * on the parent, so a registered auth plugin guards nothing at all and every
 * request is served unauthenticated. `rateLimitPlugin` is called directly for
 * the same reason.
 *
 * - Requests to `/status/*` and `/multipass/api/oauth2/*` are exempt, along
 *   with the login endpoint and - only while open signup is enabled - signup.
 *   Those are where a caller gets a token; everything else needs one.
 * - All other requests must carry `Authorization: Bearer <jwt>`.
 * - On success the decoded claims are attached to `request.claims`, and the
 *   `org` claim to `request.orgRid`.
 */
export async function authPlugin(
  app: FastifyInstance,
  options: AuthPluginOptions,
): Promise<void> {
  const { config } = options;

  // Build the verification key from config. A PEM has to be imported as a key
  // object: passing its raw bytes makes jose read them as an HMAC secret and
  // reject every ES256 token. A bad key fails here, at startup, rather than as
  // an unexplained 401 on every request.
  const publicKey = config.authPublicKey
    ? await importVerificationKey(config.authPublicKey)
    : null;

  if (!publicKey) {
    app.log.warn(
      "AUTH_PUBLIC_KEY is not set — JWT verification is disabled. " +
      "Do NOT run this configuration in production.",
    );
  }

  const validateOptions: ValidateTokenOptions = {
    issuer: config.authIssuer || undefined,
    audience: config.authAudience || undefined,
  };

  app.addHook("onRequest", async (request: FastifyRequest, _reply) => {
    if (shouldSkipAuth(request.url)) {
      return;
    }

    // If no public key is configured (dev mode), skip verification entirely.
    if (!publicKey) {
      return;
    }

    const token = extractBearerToken(request);
    if (!token) {
      throw new OpenFoundryApiError({
        errorCode: ErrorCode.CUSTOM_CLIENT,
        errorName: "MissingAuthToken",
        message: "Authorization header with Bearer token is required",
        statusCode: 401,
      });
    }

    try {
      const claims = await validateToken(token, publicKey, validateOptions);
      request.claims = claims;

      // Extract tenant org from JWT claims for RLS and per-tenant rate limiting
      const orgClaim = claims.org;
      if (typeof orgClaim === "string" && orgClaim.length > 0) {
        request.orgRid = orgClaim;
      }
    } catch (err: unknown) {
      if (err instanceof TokenValidationError) {
        throw new OpenFoundryApiError({
          errorCode: ErrorCode.CUSTOM_CLIENT,
          errorName: "InvalidAuthToken",
          message: `Authentication failed: ${err.message}`,
          statusCode: 401,
          cause: err,
        });
      }
      throw err;
    }
  });
}
