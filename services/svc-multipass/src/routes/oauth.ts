import type { FastifyInstance } from "fastify";
import { importPKCS8, importSPKI } from "jose";
import { createToken, buildTokenInput, validateToken } from "@openfoundry/auth-tokens";
import { invalidArgument } from "@openfoundry/errors";
import { generateRid } from "@openfoundry/rid";
import type { MultipassConfig } from "../config.js";
import { verifyCodeChallenge } from "../pkce.js";
import { TokenStore } from "../store/token-store.js";
import { ClientStore } from "../store/client-store.js";

/** Key type compatible with jose v5 (KeyLike) and v6 (CryptoKey). */
type SigningKey = CryptoKey | Uint8Array;

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
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

interface AuthorizeQuery {
  response_type: string;
  client_id: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: "S256" | "plain";
}

interface RevokeRequest {
  token: string;
  token_type_hint?: "refresh_token" | "access_token";
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface OAuthRoutesOptions {
  config: MultipassConfig;
  tokenStore?: TokenStore;
  clientStore?: ClientStore;
  privateKey?: SigningKey;
  publicKey?: SigningKey;
}

export async function oauthRoutes(
  app: FastifyInstance,
  options: OAuthRoutesOptions,
): Promise<void> {
  const { config } = options;
  const tokenStore = options.tokenStore ?? new TokenStore();
  const clientStore = options.clientStore ?? new ClientStore();

  // Import keys — allow pre-imported keys for testing
  let privateKey: SigningKey;
  let publicKey: SigningKey;

  if (options.privateKey && options.publicKey) {
    privateKey = options.privateKey;
    publicKey = options.publicKey;
  } else if (config.jwtPrivateKey && config.jwtPublicKey) {
    privateKey = await importPKCS8(config.jwtPrivateKey, "ES256");
    publicKey = await importSPKI(config.jwtPublicKey, "ES256");
  } else {
    // Auto-generate ephemeral dev keys when none are provided
    const { generateKeyPair } = await import("jose");
    const keyPair = await generateKeyPair("ES256");
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;
    app.log.warn("No JWT keys configured — generated ephemeral ES256 key pair. Do NOT use in production.");
  }

  // -- Token endpoint -------------------------------------------------------
  app.post<{ Body: TokenRequest }>("/multipass/api/oauth2/token", async (request, reply) => {
    const body = request.body as TokenRequest;
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

  // -- Authorize endpoint ---------------------------------------------------
  app.get<{ Querystring: AuthorizeQuery }>("/multipass/api/oauth2/authorize", async (request, reply) => {
    const query = request.query as AuthorizeQuery;

    if (query.response_type !== "code") {
      throw invalidArgument("response_type", "must be 'code'");
    }

    if (!query.client_id) {
      throw invalidArgument("client_id", "is required");
    }

    const client = clientStore.getClient(query.client_id);
    if (!client) {
      throw invalidArgument("client_id", "unknown client");
    }

    // Validate redirect URI
    const redirectUri = query.redirect_uri ?? client.redirectUris[0];
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      throw invalidArgument("redirect_uri", "invalid redirect URI");
    }

    const scope = query.scope ?? client.scopes.join(" ");

    // Generate authorization code
    const code = crypto.randomUUID();

    tokenStore.storeAuthCode({
      code,
      clientId: query.client_id,
      userId: "user-default",
      redirectUri,
      scope,
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method,
    });

    const responsePayload: Record<string, string> = { code };
    if (query.state) {
      responsePayload.state = query.state;
    }

    return reply.status(200).send(responsePayload);
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
      code_challenge_methods_supported: ["S256", "plain"],
    });
  });

  // -------------------------------------------------------------------------
  // Grant handlers
  // -------------------------------------------------------------------------

  async function handleAuthorizationCodeGrant(
    body: TokenRequest,
    reply: import("fastify").FastifyReply,
  ): Promise<TokenResponse> {
    if (!body.code) {
      throw invalidArgument("code", "is required for authorization_code grant");
    }

    const clientId = body.client_id;
    if (!clientId) {
      throw invalidArgument("client_id", "is required");
    }

    const client = clientStore.getClient(clientId);
    if (!client) {
      throw invalidArgument("client_id", "unknown client");
    }

    if (!clientStore.validateClientSecret(clientId, body.client_secret)) {
      throw invalidArgument("client_secret", "invalid client credentials");
    }

    const authCode = tokenStore.consumeAuthCode(body.code);
    if (!authCode) {
      throw invalidArgument("code", "invalid, expired, or already consumed authorization code");
    }

    if (authCode.clientId !== clientId) {
      throw invalidArgument("client_id", "code was issued to a different client");
    }

    if (body.redirect_uri && body.redirect_uri !== authCode.redirectUri) {
      throw invalidArgument("redirect_uri", "does not match the authorization request");
    }

    // PKCE verification
    if (authCode.codeChallenge) {
      if (!body.code_verifier) {
        throw invalidArgument("code_verifier", "is required when PKCE was used in authorization");
      }

      const method = authCode.codeChallengeMethod ?? "plain";
      const valid = await verifyCodeChallenge(body.code_verifier, authCode.codeChallenge, method);
      if (!valid) {
        throw invalidArgument("code_verifier", "PKCE verification failed");
      }
    }

    return issueTokens(authCode.userId, authCode.scope, clientId, reply);
  }

  async function handleClientCredentialsGrant(
    body: TokenRequest,
    reply: import("fastify").FastifyReply,
  ): Promise<TokenResponse> {
    const clientId = body.client_id;
    if (!clientId) {
      throw invalidArgument("client_id", "is required for client_credentials grant");
    }

    const client = clientStore.getClient(clientId);
    if (!client) {
      throw invalidArgument("client_id", "unknown client");
    }

    if (!client.grantTypes.includes("client_credentials")) {
      throw invalidArgument("grant_type", "client is not authorized for client_credentials grant");
    }

    if (!clientStore.validateClientSecret(clientId, body.client_secret)) {
      throw invalidArgument("client_secret", "invalid client credentials");
    }

    const scope = body.scope ?? client.scopes.join(" ");

    return issueTokens(`service:${clientId}`, scope, clientId, reply);
  }

  async function handleRefreshTokenGrant(
    body: TokenRequest,
    reply: import("fastify").FastifyReply,
  ): Promise<TokenResponse> {
    if (!body.refresh_token) {
      throw invalidArgument("refresh_token", "is required for refresh_token grant");
    }

    const stored = tokenStore.getRefreshToken(body.refresh_token);
    if (!stored) {
      throw invalidArgument("refresh_token", "invalid, expired, or revoked refresh token");
    }

    // Revoke the old refresh token (rotation)
    tokenStore.revokeRefreshToken(body.refresh_token);

    return issueTokens(stored.userId, stored.scope, stored.clientId, reply);
  }

  async function issueTokens(
    userId: string,
    scope: string,
    clientId: string,
    reply: import("fastify").FastifyReply,
  ): Promise<TokenResponse> {
    const rid = generateRid("multipass", "token");
    const sessionId = crypto.randomUUID();

    const tokenInput = buildTokenInput(
      {
        sub: userId,
        sid: sessionId,
        jti: rid.toString(),
        org: "default-org",
        svc: "multipass",
        iss: "openfoundry-multipass",
        aud: "openfoundry-api",
        scope,
      },
      config.tokenExpirySeconds,
    );

    const accessToken = await createToken(tokenInput, privateKey);

    // Issue refresh token
    const refreshTokenValue = crypto.randomUUID();
    const refreshExpiresAt = Math.floor(Date.now() / 1000) + config.refreshTokenExpirySeconds;

    tokenStore.storeRefreshToken({
      token: refreshTokenValue,
      clientId,
      userId,
      scope,
      expiresAt: refreshExpiresAt,
      revoked: false,
    });

    const response: TokenResponse = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: config.tokenExpirySeconds,
      refresh_token: refreshTokenValue,
      scope,
    };

    return reply.status(200).send(response);
  }
}
