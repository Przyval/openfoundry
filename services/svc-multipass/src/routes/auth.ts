import type { FastifyInstance } from "fastify";
import { invalidArgument } from "@openfoundry/errors";
import { createToken, buildTokenInput } from "@openfoundry/auth-tokens";
import { generateRid } from "@openfoundry/rid";
import { importPKCS8, importSPKI } from "jose";
import type { MultipassConfig } from "../config.js";

/** Key type compatible with jose v5/v6. */
type SigningKey = CryptoKey | Uint8Array;

// ---------------------------------------------------------------------------
// Default dev users (username -> password)
// ---------------------------------------------------------------------------

const DEV_USERS: Record<string, { password: string; roles: string[]; displayName: string }> = {
  admin: { password: "admin123", roles: ["ADMIN"], displayName: "Admin User" },
  developer: { password: "dev123", roles: ["EDITOR"], displayName: "Dev User" },
  analyst: { password: "analyst123", roles: ["VIEWER"], displayName: "Analyst User" },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoginBody {
  username: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface AuthRoutesOptions {
  config: MultipassConfig;
  privateKey?: SigningKey;
  publicKey?: SigningKey;
}

export async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const { config } = options;

  // Import or generate keys (same logic as oauth.ts)
  let privateKey: SigningKey;

  if (options.privateKey) {
    privateKey = options.privateKey;
  } else if (config.jwtPrivateKey && config.jwtPublicKey) {
    privateKey = await importPKCS8(config.jwtPrivateKey, "ES256");
  } else {
    const { generateKeyPair } = await import("jose");
    const keyPair = await generateKeyPair("ES256");
    privateKey = keyPair.privateKey;
    app.log.warn("Auth routes: using ephemeral keys (shared with OAuth if started together).");
  }

  // -- Login endpoint -------------------------------------------------------
  app.post<{ Body: LoginBody }>("/multipass/api/auth/login", async (request, reply) => {
    const { username, password } = request.body ?? {};

    if (!username) {
      throw invalidArgument("username", "is required");
    }

    const user = DEV_USERS[username];
    if (!user || user.password !== password) {
      return reply.status(401).send({
        errorCode: "UNAUTHORIZED",
        errorName: "InvalidCredentials",
        errorInstanceId: crypto.randomUUID(),
        parameters: {},
        statusCode: 401,
        message: "Invalid username or password",
      });
    }

    // Issue JWT
    const rid = generateRid("multipass", "token");
    const sessionId = crypto.randomUUID();

    const tokenInput = buildTokenInput(
      {
        sub: username,
        sid: sessionId,
        jti: rid.toString(),
        org: "default-org",
        svc: "multipass",
        iss: "openfoundry-multipass",
        aud: "openfoundry-api",
        scope: "api:read api:write",
      },
      config.tokenExpirySeconds,
    );

    const accessToken = await createToken(tokenInput, privateKey);

    return reply.status(200).send({
      accessToken,
      expiresIn: config.tokenExpirySeconds,
      roles: user.roles,
      username,
      displayName: user.displayName,
    });
  });

  // -- Who am I (quick check) -----------------------------------------------
  app.get("/multipass/api/auth/me", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Not authenticated" });
    }
    // For dev mode, just decode the JWT payload without full validation
    const token = authHeader.slice(7);
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      );
      return reply.status(200).send({
        username: payload.sub,
        org: payload.org,
        scope: payload.scope,
      });
    } catch {
      return reply.status(401).send({ error: "Invalid token" });
    }
  });

  // -- Get current user (Palantir @osdk/client compatible) ------------------
  // GET /api/v2/admin/users/getCurrent
  app.get("/api/v2/admin/users/getCurrent", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({
        errorCode: "UNAUTHORIZED",
        errorName: "Unauthorized",
        errorInstanceId: crypto.randomUUID(),
        parameters: {},
        statusCode: 401,
        message: "Missing bearer token",
      });
    }

    const token = authHeader.slice(7);
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      );

      const username = payload.sub ?? "unknown";
      const user = DEV_USERS[username];

      return reply.status(200).send({
        id: username,
        username,
        givenName: user?.displayName?.split(" ")[0] ?? username,
        familyName: user?.displayName?.split(" ")[1] ?? "",
        email: `${username}@openfoundry.local`,
        realm: "openfoundry",
        organization: payload.org ?? "default-org",
        attributes: {
          "multipass:realm": ["openfoundry"],
          "multipass:organization": [payload.org ?? "default-org"],
        },
      });
    } catch {
      return reply.status(401).send({
        errorCode: "UNAUTHORIZED",
        errorName: "Unauthorized",
        errorInstanceId: crypto.randomUUID(),
        parameters: {},
        statusCode: 401,
        message: "Invalid token",
      });
    }
  });
}
