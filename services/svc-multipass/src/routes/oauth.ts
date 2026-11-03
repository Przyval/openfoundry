import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createToken,
  buildTokenInput,
  validateToken,
} from "@openfoundry/auth-tokens";
import { invalidArgument } from "@openfoundry/errors";
import { generateRid } from "@openfoundry/rid";
import type { MultipassConfig } from "../config.js";
import type { SigningKey } from "../keys.js";
import { verifyCodeChallenge } from "../pkce.js";
import { TokenStore } from "../store/token-store.js";
import type { ClientStore, OAuthClient } from "../store/client-store.js";
import { DEFAULT_ORG, userTokenClaims, type UserDirectory } from "../store/user-store.js";
import { registerAuthorizeRoutes } from "./authorize.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenRequest {
  grant_type: string;
  client_id?: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface RevokeRequest {
  token: string;
  token_type_hint?: "refresh_token" | "access_token";
}

/** What a token says about its subject beyond the subject's name. */
type SubjectClaims = ReturnType<typeof userTokenClaims>;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface OAuthRoutesOptions {
  config: MultipassConfig;
  tokenStore?: TokenStore;
  clientStore: ClientStore;
  users: UserDirectory;
  privateKey: SigningKey;
  publicKey: SigningKey;
}

export async function oauthRoutes(
  app: FastifyInstance,
  options: OAuthRoutesOptions,
): Promise<void> {
  const { config, clientStore, users, privateKey, publicKey } = options;
  const tokenStore = options.tokenStore ?? new TokenStore();

  registerAuthorizeRoutes(app, { clientStore, tokenStore, users });

  // -- Token endpoint -------------------------------------------------------
  app.post<{ Body: TokenRequest }>("/multipass/api/oauth2/token", async (request, reply) => {
    const body = (request.body ?? {}) as TokenRequest;
    const grantType = body.grant_type;

    if (!grantType) {
      throw invalidArgument("grant_type", "is required");
    }

    switch (grantType) {
      case "authorization_code":
        return handleAuthorizationCodeGrant(body, reply);
      case "client_credentials":
        return handleClientCredentialsGrant(body, reply);
      case "refresh_token":
        return handleRefreshTokenGrant(body, reply);
      default:
        throw invalidArgument("grant_type", `unsupported grant type: ${grantType}`);
    }
  });

  // -- Revoke endpoint ------------------------------------------------------
  app.post<{ Body: RevokeRequest }>("/multipass/api/oauth2/revoke", async (request, reply) => {
    const body = request.body as RevokeRequest;

    if (!body.token) {
      throw invalidArgument("token", "is required");
    }

    // Per RFC 7009, revoke always returns 200 regardless of whether the token existed
    tokenStore.revokeRefreshToken(body.token);
    return reply.status(200).send({ revoked: true });
  });

  // -- UserInfo endpoint ----------------------------------------------------
  app.get("/multipass/api/userinfo", async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "invalid_token", error_description: "Missing bearer token" });
    }

    const token = authHeader.slice(7);

    try {
      const claims = await validateToken(token, publicKey, {
        issuer: "openfoundry-multipass",
        audience: "openfoundry-api",
      });

      return reply.status(200).send({
        sub: claims.sub,
        org: claims.org,
        scope: claims.scope,
        sid: claims.sid,
        svc: claims.svc,
      });
    } catch {
      return reply.status(401).send({ error: "invalid_token", error_description: "Token validation failed" });
    }
  });

  // -- OpenID Connect Discovery ---------------------------------------------
  app.get("/.well-known/openid-configuration", async (_request, reply) => {
    const baseUrl = `http://localhost:${config.port}`;

    return reply.status(200).send({
      issuer: "openfoundry-multipass",
      authorization_endpoint: `${baseUrl}/multipass/api/oauth2/authorize`,
      token_endpoint: `${baseUrl}/multipass/api/oauth2/token`,
      revocation_endpoint: `${baseUrl}/multipass/api/oauth2/revoke`,
      userinfo_endpoint: `${baseUrl}/multipass/api/userinfo`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      scopes_supported: ["api:read", "api:write", "api:ontologies-read", "api:ontologies-write", "api:datasets-read", "api:datasets-write"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      code_challenge_methods_supported: ["S256"],
    });
  });

  // -------------------------------------------------------------------------
  // Grant handlers
  // -------------------------------------------------------------------------

  /**
   * The client named by `client_id`, authenticated when it is confidential.
   * A public client has no secret to check; what binds its requests is PKCE
   * at the code exchange and the client binding of its refresh tokens.
   */
  function authenticatedClient(body: TokenRequest): OAuthClient {
    const clientId = body.client_id;
    if (!clientId) {
      throw invalidArgument("client_id", "is required");
    }

    const client = clientStore.getClient(clientId);
    if (!client) {
      throw invalidArgument("client_id", "unknown client");
    }

    if (!client.isPublic && !clientStore.validateClientSecret(clientId, body.client_secret)) {
      throw invalidArgument("client_secret", "invalid client credentials");
    }

    return client;
  }

  /**
   * The claims for a user, read now rather than remembered: a user disabled
   * or demoted since they logged in gets no token, or a token with their
   * current roles, on the next exchange or refresh.
   */
  async function userClaims(username: string): Promise<SubjectClaims> {
    const user = await users.findByUsername(username);
    if (!user || !user.active) {
      throw invalidArgument("grant", "the user is unknown or disabled");
    }
    return userTokenClaims(user);
  }

  async function handleAuthorizationCodeGrant(
    body: TokenRequest,
    reply: FastifyReply,
  ): Promise<TokenResponse> {
    if (!body.code) {
      throw invalidArgument("code", "is required for authorization_code grant");
    }

    const client = authenticatedClient(body);
    if (!client.grantTypes.includes("authorization_code")) {
      throw invalidArgument("grant_type", "client is not authorized for the authorization_code grant");
    }

    const authCode = tokenStore.consumeAuthCode(body.code);
    if (!authCode) {
      throw invalidArgument("code", "invalid, expired, or already consumed authorization code");
    }

    if (authCode.clientId !== client.clientId) {
      throw invalidArgument("client_id", "code was issued to a different client");
    }

    if (body.redirect_uri && body.redirect_uri !== authCode.redirectUri) {
      throw invalidArgument("redirect_uri", "does not match the authorization request");
    }

    // PKCE verification. /authorize demands a challenge from every public
    // client, so a public client's code always carries one.
    if (authCode.codeChallenge) {
      if (!body.code_verifier) {
        throw invalidArgument("code_verifier", "is required when PKCE was used in authorization");
      }

      const method = authCode.codeChallengeMethod ?? "S256";
      const valid = await verifyCodeChallenge(body.code_verifier, authCode.codeChallenge, method);
      if (!valid) {
        throw invalidArgument("code_verifier", "PKCE verification failed");
      }
    }

    const claims = await userClaims(authCode.userId);
    return issueTokens(authCode.userId, authCode.scope, client, claims, reply, true);
  }

  async function handleClientCredentialsGrant(
    body: TokenRequest,
    reply: FastifyReply,
  ): Promise<TokenResponse> {
    if (!body.client_id) {
      throw invalidArgument("client_id", "is required for client_credentials grant");
    }

    const client = authenticatedClient(body);
    if (client.isPublic || !client.grantTypes.includes("client_credentials")) {
      throw invalidArgument("grant_type", "client is not authorized for client_credentials grant");
    }

    const scope = body.scope ?? client.scopes.join(" ");

    return issueTokens(`service:${client.clientId}`, scope, client, {
      org: DEFAULT_ORG,
      ...(client.roles && client.roles.length > 0 ? { roles: client.roles.join(" ") } : {}),
    }, reply, false);
  }

  async function handleRefreshTokenGrant(
    body: TokenRequest,
    reply: FastifyReply,
  ): Promise<TokenResponse> {
    if (!body.refresh_token) {
      throw invalidArgument("refresh_token", "is required for refresh_token grant");
    }

    const client = authenticatedClient(body);

    const stored = tokenStore.getRefreshToken(body.refresh_token);
    if (!stored || stored.clientId !== client.clientId) {
      // A refresh token is bound to the client it was issued to (RFC 6749
      // section 6). Reporting a foreign one exactly like an unknown one says
      // nothing about which tokens exist.
      throw invalidArgument("refresh_token", "invalid, expired, or revoked refresh token");
    }

    // Revoke the old refresh token (rotation)
    tokenStore.revokeRefreshToken(body.refresh_token);

    const claims = await userClaims(stored.userId);
    return issueTokens(stored.userId, stored.scope, client, claims, reply, true);
  }

  async function issueTokens(
    subject: string,
    scope: string,
    client: OAuthClient,
    claims: SubjectClaims,
    reply: FastifyReply,
    forUser: boolean,
  ): Promise<TokenResponse> {
    const rid = generateRid("multipass", "token");
    const sessionId = crypto.randomUUID();

    const tokenInput = buildTokenInput(
      {
        sub: subject,
        sid: sessionId,
        jti: rid.toString(),
        svc: "multipass",
        iss: "openfoundry-multipass",
        aud: "openfoundry-api",
        scope,
        ...claims,
      },
      config.tokenExpirySeconds,
    );

    const accessToken = await createToken(tokenInput, privateKey);

    const response: TokenResponse = {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: config.tokenExpirySeconds,
      scope,
    };

    // Only a user's sign-in, by a client allowed the refresh_token grant, gets
    // one. A client_credentials client re-authenticates instead (RFC 6749
    // section 4.4.3) whatever grants it declares, so a leaked refresh token is
    // never a second, secret-free way to act as it.
    if (forUser && client.grantTypes.includes("refresh_token")) {
      const refreshTokenValue = randomBytes(32).toString("base64url");
      tokenStore.storeRefreshToken({
        token: refreshTokenValue,
        clientId: client.clientId,
        userId: subject,
        scope,
        expiresAt: Math.floor(Date.now() / 1000) + config.refreshTokenExpirySeconds,
        revoked: false,
      });
      response.refresh_token = refreshTokenValue;
    }

    return reply.status(200).send(response);
  }
}
