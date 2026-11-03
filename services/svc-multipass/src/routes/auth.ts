import type { FastifyInstance } from "fastify";
import { invalidArgument } from "@openfoundry/errors";
import {
  createToken,
  buildTokenInput,
  isOpenSignupEnabled,
  OPEN_SIGNUP_ENV_VAR,
} from "@openfoundry/auth-tokens";
import { generateRid } from "@openfoundry/rid";
import type { MultipassConfig } from "../config.js";
import type { SigningKey } from "../keys.js";
import { hashPassword } from "../passwords.js";
import { authenticate, userTokenClaims, type UserDirectory } from "../store/user-store.js";

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
  users: UserDirectory;
  privateKey: SigningKey;
}

export async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  const { config, users, privateKey } = options;

  // -- Login endpoint -------------------------------------------------------
  // A direct username/password login for the console's development form. It
  // checks the same user directory as the /authorize sign-in page; browsers
  // in production sign in through that page instead.
  app.post<{ Body: LoginBody }>("/multipass/api/auth/login", async (request, reply) => {
    const { username, password } = request.body ?? {};

    if (!username) {
      throw invalidArgument("username", "is required");
    }

    const user = await authenticate(users, username, password ?? "");
    if (!user) {
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
        sub: user.username,
        sid: sessionId,
        jti: rid.toString(),
        svc: "multipass",
        iss: "openfoundry-multipass",
        aud: "openfoundry-api",
        scope: "api:read api:write",
        // Signed into the token so the gateway can hand downstream services
        // roles, groups and markings they can trust. Anything that only
        // travels in this response body is something the client could invent.
        ...userTokenClaims(user),
      },
      config.tokenExpirySeconds,
    );

    const accessToken = await createToken(tokenInput, privateKey);

    return reply.status(200).send({
      accessToken,
      expiresIn: config.tokenExpirySeconds,
      roles: user.roles,
      username: user.username,
      displayName: user.displayName,
    });
  });

  // -- Signup endpoint -------------------------------------------------------
  // Creates a new user + organization, issues a JWT with org claim.
  // Disabled unless OPENFOUNDRY_ALLOW_OPEN_SIGNUP is set: an open endpoint that
  // mints a signed token for any caller-chosen username is not safe by default.
  // NOTE: User/org data is NOT yet persisted to the database. The JWT is valid
  // until expiry, but after a service restart the orgRid is gone and the user
  // will appear to have an empty tenant. Persistence is tracked in:
  //   TODO: persist user + org to users/organizations tables (Phase 2)
  app.post<{
    Body: { username: string; password: string; email?: string; displayName?: string; orgName?: string };
  }>("/api/v2/auth/signup", async (request, reply) => {
    if (!isOpenSignupEnabled()) {
      return reply.status(403).send({
        errorCode: "PERMISSION_DENIED",
        errorName: "OpenSignupDisabled",
        errorInstanceId: crypto.randomUUID(),
        parameters: { envVar: OPEN_SIGNUP_ENV_VAR },
        statusCode: 403,
        message:
          `Open signup is disabled. Set ${OPEN_SIGNUP_ENV_VAR}=1 on svc-multipass ` +
          `and the gateway to enable POST /api/v2/auth/signup.`,
      });
    }

    const { username, password, displayName } = request.body ?? {};

    if (!username || username.length < 3) {
      throw invalidArgument("username", "must be at least 3 characters");
    }
    if (!password || password.length < 8) {
      throw invalidArgument("password", "must be at least 8 characters");
    }

    if (await users.findByUsername(username)) {
      return reply.status(409).send({
        errorCode: "CONFLICT",
        errorName: "UserAlreadyExists",
        errorInstanceId: crypto.randomUUID(),
        parameters: { username },
        statusCode: 409,
        message: `Username '${username}' is already taken`,
      });
    }

    // Hash the password (persisted in Phase 2 — see TODO above)
    await hashPassword(password);

    // Create organization for this tenant
    const orgRid = generateRid("multipass", "org").toString();
    const userRid = generateRid("multipass", "user").toString();

    // Issue JWT with org claim
    const sessionId = crypto.randomUUID();
    const tokenRid = generateRid("multipass", "token");

    const tokenInput = buildTokenInput(
      {
        sub: username,
        sid: sessionId,
        jti: tokenRid.toString(),
        org: orgRid,
        svc: "multipass",
        iss: "openfoundry-multipass",
        aud: "openfoundry-api",
        scope: "api:read api:write",
      },
      config.tokenExpirySeconds,
    );

    const accessToken = await createToken(tokenInput, privateKey);

    app.log.info(
      { username, orgRid, userRid, passwordHash: "[REDACTED]" },
      "New user signup — org and user created",
    );

    return reply.status(201).send({
      accessToken,
      expiresIn: config.tokenExpirySeconds,
      username,
      displayName: displayName ?? username,
      orgRid,
      userRid,
      passwordHash: undefined, // never expose
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
      const user = await users.findByUsername(username);

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
