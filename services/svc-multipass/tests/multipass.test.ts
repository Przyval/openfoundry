import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { generateKeyPair, type KeyLike } from "jose";
import { generateCodeChallenge, verifyCodeChallenge } from "../src/pkce.js";
import { TokenStore } from "../src/store/token-store.js";
import { ClientStore } from "../src/store/client-store.js";
import { createServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

let privateKey: KeyLike;
let publicKey: KeyLike;

beforeAll(async () => {
  const keyPair = await generateKeyPair("ES256", { extractable: true });
  privateKey = keyPair.privateKey;
  publicKey = keyPair.publicKey;
});

// ---------------------------------------------------------------------------
// PKCE tests
// ---------------------------------------------------------------------------

describe("PKCE", () => {
  it("should generate a S256 code challenge", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await generateCodeChallenge(verifier, "S256");

    expect(challenge).toBeTruthy();
    expect(typeof challenge).toBe("string");
    // S256 challenges are base64url-encoded SHA-256 hashes (43 chars without padding)
    expect(challenge.length).toBe(43);
  });

  it("should generate a plain code challenge (identity)", async () => {
    const verifier = "my-plain-verifier";
    const challenge = await generateCodeChallenge(verifier, "plain");
    expect(challenge).toBe(verifier);
  });

  it("should verify a valid S256 challenge", async () => {
    const verifier = "a]C8I6$n%y3+7&9Jqz!dR5Xw2Kp@m4Lv";
    const challenge = await generateCodeChallenge(verifier, "S256");
    const result = await verifyCodeChallenge(verifier, challenge, "S256");
    expect(result).toBe(true);
  });

  it("should reject an invalid S256 verifier", async () => {
    const verifier = "correct-verifier";
    const challenge = await generateCodeChallenge(verifier, "S256");
    const result = await verifyCodeChallenge("wrong-verifier", challenge, "S256");
    expect(result).toBe(false);
  });

  it("should verify a valid plain challenge", async () => {
    const verifier = "plain-verifier-value";
    const result = await verifyCodeChallenge(verifier, verifier, "plain");
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TokenStore tests
// ---------------------------------------------------------------------------

describe("TokenStore", () => {
  let store: TokenStore;

  beforeEach(() => {
    store = new TokenStore();
  });

  it("should store and retrieve a refresh token", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    store.storeRefreshToken({
      token: "rt-abc",
      clientId: "client-1",
      userId: "user-1",
      scope: "api:read",
      expiresAt,
      revoked: false,
    });

    const retrieved = store.getRefreshToken("rt-abc");
    expect(retrieved).toBeDefined();
    expect(retrieved!.token).toBe("rt-abc");
    expect(retrieved!.userId).toBe("user-1");
  });

  it("should return undefined for a non-existent refresh token", () => {
    expect(store.getRefreshToken("does-not-exist")).toBeUndefined();
  });

  it("should revoke a refresh token", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    store.storeRefreshToken({
      token: "rt-revoke",
      clientId: "client-1",
      userId: "user-1",
      scope: "api:read",
      expiresAt,
      revoked: false,
    });

    const revoked = store.revokeRefreshToken("rt-revoke");
    expect(revoked).toBe(true);

    const retrieved = store.getRefreshToken("rt-revoke");
    expect(retrieved).toBeUndefined();
  });

  it("should return false when revoking a non-existent token", () => {
    expect(store.revokeRefreshToken("nope")).toBe(false);
  });

  it("should not return an expired refresh token", () => {
    store.storeRefreshToken({
      token: "rt-expired",
      clientId: "client-1",
      userId: "user-1",
      scope: "api:read",
      expiresAt: Math.floor(Date.now() / 1000) - 1, // already expired
      revoked: false,
    });

    expect(store.getRefreshToken("rt-expired")).toBeUndefined();
  });

  // Auth code tests

  it("should store and consume an auth code", () => {
    store.storeAuthCode({
      code: "code-123",
      clientId: "client-1",
      userId: "user-1",
      redirectUri: "http://localhost:3000/callback",
      scope: "api:read",
    });

    const consumed = store.consumeAuthCode("code-123");
    expect(consumed).toBeDefined();
    expect(consumed!.code).toBe("code-123");
    expect(consumed!.userId).toBe("user-1");
  });

  it("should not allow consuming an auth code twice", () => {
    store.storeAuthCode({
      code: "code-once",
      clientId: "client-1",
      userId: "user-1",
      redirectUri: "http://localhost:3000/callback",
      scope: "api:read",
    });

    const first = store.consumeAuthCode("code-once");
    expect(first).toBeDefined();

    const second = store.consumeAuthCode("code-once");
    expect(second).toBeUndefined();
  });

  it("should return undefined for a non-existent auth code", () => {
    expect(store.consumeAuthCode("no-such-code")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ClientStore tests
// ---------------------------------------------------------------------------

describe("ClientStore", () => {
  let store: ClientStore;

  beforeEach(() => {
    store = new ClientStore();
  });

  it("should return the pre-seeded dev client", () => {
    const client = store.getClient("openfoundry-dev");
    expect(client).toBeDefined();
    expect(client!.clientId).toBe("openfoundry-dev");
    expect(client!.isPublic).toBe(true);
    expect(client!.redirectUris).toContain("http://localhost:3000/callback");
  });

  it("should return undefined for unknown clients", () => {
    expect(store.getClient("unknown")).toBeUndefined();
  });

  it("should validate a public client without a secret", () => {
    expect(store.validateClientSecret("openfoundry-dev", undefined)).toBe(true);
  });

  it("should validate a confidential client with correct secret", () => {
    store.registerClient({
      clientId: "confidential-app",
      clientSecret: "super-secret",
      clientName: "Confidential App",
      redirectUris: ["http://localhost:4000/callback"],
      grantTypes: ["client_credentials"],
      scopes: ["api:read"],
      isPublic: false,
    });

    expect(store.validateClientSecret("confidential-app", "super-secret")).toBe(true);
    expect(store.validateClientSecret("confidential-app", "wrong-secret")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OAuth route integration tests
// ---------------------------------------------------------------------------

describe("OAuth routes", () => {
  let app: FastifyInstance;
  let tokenStore: TokenStore;
  let clientStore: ClientStore;

  beforeEach(async () => {
    tokenStore = new TokenStore();
    clientStore = new ClientStore();

    // Register a confidential client for client_credentials tests
    clientStore.registerClient({
      clientId: "service-app",
      clientSecret: "service-secret",
      clientName: "Service App",
      redirectUris: [],
      grantTypes: ["client_credentials"],
      scopes: ["api:read", "api:write"],
      isPublic: false,
    });

    app = await createServer({
      config: {
        port: 0,
        host: "127.0.0.1",
        databaseUrl: "",
        jwtPrivateKey: "",
        jwtPublicKey: "",
        tokenExpirySeconds: 3600,
        refreshTokenExpirySeconds: 86400 * 30,
        logLevel: "silent",
        nodeEnv: "test",
      },
      oauthOptions: {
        tokenStore,
        clientStore,
        privateKey,
        publicKey,
      },
    });

    await app.ready();
  });

  it("should issue tokens via client_credentials grant", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "client_credentials",
        client_id: "service-app",
        client_secret: "service-secret",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.access_token).toBeTruthy();
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(body.refresh_token).toBeTruthy();
    expect(body.scope).toBe("api:read api:write");
  });

  it("should complete authorization code flow", async () => {
    // Step 1: Get an authorization code
    const authorizeResponse = await app.inject({
      method: "GET",
      url: "/multipass/api/oauth2/authorize",
      query: {
        response_type: "code",
        client_id: "openfoundry-dev",
        redirect_uri: "http://localhost:3000/callback",
        scope: "api:read",
        state: "xyz",
      },
    });

    expect(authorizeResponse.statusCode).toBe(200);
    const authorizeBody = authorizeResponse.json();
    expect(authorizeBody.code).toBeTruthy();
    expect(authorizeBody.state).toBe("xyz");

    // Step 2: Exchange code for tokens
    const tokenResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "authorization_code",
        client_id: "openfoundry-dev",
        code: authorizeBody.code,
        redirect_uri: "http://localhost:3000/callback",
      },
    });

    expect(tokenResponse.statusCode).toBe(200);
    const tokenBody = tokenResponse.json();
    expect(tokenBody.access_token).toBeTruthy();
    expect(tokenBody.refresh_token).toBeTruthy();
    expect(tokenBody.scope).toBe("api:read");
  });

  it("should complete authorization code flow with PKCE", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await generateCodeChallenge(verifier, "S256");

    // Step 1: Authorize with code challenge
    const authorizeResponse = await app.inject({
      method: "GET",
      url: "/multipass/api/oauth2/authorize",
      query: {
        response_type: "code",
        client_id: "openfoundry-dev",
        redirect_uri: "http://localhost:3000/callback",
        scope: "api:read",
        code_challenge: challenge,
        code_challenge_method: "S256",
      },
    });

    const { code } = authorizeResponse.json();

    // Step 2: Exchange with code_verifier
    const tokenResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "authorization_code",
        client_id: "openfoundry-dev",
        code,
        redirect_uri: "http://localhost:3000/callback",
        code_verifier: verifier,
      },
    });

    expect(tokenResponse.statusCode).toBe(200);
    const tokenBody = tokenResponse.json();
    expect(tokenBody.access_token).toBeTruthy();
  });

  it("should reject authorization code with wrong PKCE verifier", async () => {
    const verifier = "correct-verifier-value";
    const challenge = await generateCodeChallenge(verifier, "S256");

    const authorizeResponse = await app.inject({
      method: "GET",
      url: "/multipass/api/oauth2/authorize",
      query: {
        response_type: "code",
        client_id: "openfoundry-dev",
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
      },
    });

    const { code } = authorizeResponse.json();

    const tokenResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "authorization_code",
        client_id: "openfoundry-dev",
        code,
        code_verifier: "wrong-verifier",
      },
    });

    expect(tokenResponse.statusCode).toBe(400);
  });

  it("should refresh a token", async () => {
    // First, get tokens via client_credentials
    const initialResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "client_credentials",
        client_id: "service-app",
        client_secret: "service-secret",
      },
    });

    const { refresh_token } = initialResponse.json();

    // Use refresh token
    const refreshResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "refresh_token",
        refresh_token,
      },
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshBody = refreshResponse.json();
    expect(refreshBody.access_token).toBeTruthy();
    expect(refreshBody.refresh_token).toBeTruthy();
    // Rotated — new refresh token should be different
    expect(refreshBody.refresh_token).not.toBe(refresh_token);
  });

  it("should reject a used refresh token (rotation)", async () => {
    const initialResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "client_credentials",
        client_id: "service-app",
        client_secret: "service-secret",
      },
    });

    const { refresh_token } = initialResponse.json();

    // Use it once (succeeds)
    await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: { grant_type: "refresh_token", refresh_token },
    });

    // Use it again (should fail — token was rotated/revoked)
    const secondResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: { grant_type: "refresh_token", refresh_token },
    });

    expect(secondResponse.statusCode).toBe(400);
  });

  it("should revoke a token", async () => {
    const initialResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "client_credentials",
        client_id: "service-app",
        client_secret: "service-secret",
      },
    });

    const { refresh_token } = initialResponse.json();

    // Revoke
    const revokeResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/revoke",
      payload: { token: refresh_token },
    });

    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json().revoked).toBe(true);

    // Try to use it — should fail
    const refreshResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: { grant_type: "refresh_token", refresh_token },
    });

    expect(refreshResponse.statusCode).toBe(400);
  });

  it("should return user info from a valid token", async () => {
    // Get a token
    const tokenResponse = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "client_credentials",
        client_id: "service-app",
        client_secret: "service-secret",
      },
    });

    const { access_token } = tokenResponse.json();

    // Call userinfo
    const userinfoResponse = await app.inject({
      method: "GET",
      url: "/multipass/api/userinfo",
      headers: {
        authorization: `Bearer ${access_token}`,
      },
    });

    expect(userinfoResponse.statusCode).toBe(200);
    const userinfo = userinfoResponse.json();
    expect(userinfo.sub).toBe("service:service-app");
    expect(userinfo.scope).toBe("api:read api:write");
    expect(userinfo.org).toBe("default-org");
    expect(userinfo.svc).toBe("multipass");
  });

  it("should return 401 for userinfo without a token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/multipass/api/userinfo",
    });

    expect(response.statusCode).toBe(401);
  });

  it("should return OpenID discovery document", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/openid-configuration",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.issuer).toBe("openfoundry-multipass");
    expect(body.authorization_endpoint).toContain("/multipass/api/oauth2/authorize");
    expect(body.token_endpoint).toContain("/multipass/api/oauth2/token");
    expect(body.revocation_endpoint).toContain("/multipass/api/oauth2/revoke");
    expect(body.userinfo_endpoint).toContain("/multipass/api/userinfo");
    expect(body.grant_types_supported).toContain("authorization_code");
    expect(body.grant_types_supported).toContain("client_credentials");
    expect(body.grant_types_supported).toContain("refresh_token");
    expect(body.code_challenge_methods_supported).toContain("S256");
  });

  it("should return 400 for an invalid grant type", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: {
        grant_type: "invalid_grant",
        client_id: "openfoundry-dev",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errorName).toBe("InvalidArgument");
  });

  it("should return health check responses", async () => {
    const healthResponse = await app.inject({ method: "GET", url: "/status/health" });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json().status).toBe("HEALTHY");

    const livenessResponse = await app.inject({ method: "GET", url: "/status/liveness" });
    expect(livenessResponse.statusCode).toBe(200);

    const readinessResponse = await app.inject({ method: "GET", url: "/status/readiness" });
    expect(readinessResponse.statusCode).toBe(200);
  });
});
