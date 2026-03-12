import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  validateToken,
  TokenValidationError,
  type OpenFoundryClaims,
  type ValidateTokenOptions,
} from "@openfoundry/auth-tokens";
import { OpenFoundryApiError, ErrorCode } from "@openfoundry/errors";
import type { GatewayConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Module-level state (set once at registration)
// ---------------------------------------------------------------------------

let publicKey: Uint8Array | null = null;
let validateOptions: ValidateTokenOptions = {};

// ---------------------------------------------------------------------------
// Augment FastifyRequest so downstream handlers can access `.claims`
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyRequest {
    claims?: OpenFoundryClaims;
  }
}

// ---------------------------------------------------------------------------
// Route patterns that bypass authentication
// ---------------------------------------------------------------------------

const SKIP_AUTH_PREFIXES = [
  "/status/",
  "/multipass/api/oauth2/",
];

function shouldSkipAuth(url: string): boolean {
  return SKIP_AUTH_PREFIXES.some((prefix) => url.startsWith(prefix));
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
 * Fastify plugin that verifies Bearer JWT tokens on incoming requests.
 *
 * - Requests to `/status/*` and `/multipass/api/oauth2/*` are exempt.
 * - All other requests must include a valid `Authorization: Bearer <jwt>` header.
 * - On success the decoded claims are attached to `request.claims`.
 */
export async function authPlugin(
  app: FastifyInstance,
  options: AuthPluginOptions,
): Promise<void> {
  const { config } = options;

  // Build the public key from config.
  // In production, AUTH_PUBLIC_KEY should be a PEM-encoded EC public key.
  // For development/testing, if no key is set we use a passthrough (log a warning).
  if (config.authPublicKey) {
    const keyData = new TextEncoder().encode(config.authPublicKey);
    publicKey = keyData;
  } else {
    app.log.warn(
      "AUTH_PUBLIC_KEY is not set — JWT verification is disabled. " +
      "Do NOT run this configuration in production.",
    );
  }

  validateOptions = {
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
