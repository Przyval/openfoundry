import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { decodeJwt } from "jose";
import { generateCodeChallenge, verifyCodeChallenge } from "../src/pkce.js";
import { TokenStore } from "../src/store/token-store.js";
import { ClientStore, createClientStore, DEV_CLIENTS } from "../src/store/client-store.js";
import { createServer } from "../src/server.js";
import { FileAuthorizationStore, ROOT_RESOURCE } from "@openfoundry/permissions";
import { InMemoryUserDirectory } from "../src/store/user-store.js";
import {
  CONSOLE_CLIENT,
  SERVICE_CLIENT,
  signInAndExchange,
  startServer,
  testConfig,
  type TestServer,
} from "./fixtures.js";

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
// ClientStore
// ---------------------------------------------------------------------------

describe("ClientStore", () => {
  it("returns undefined for unknown clients", () => {
    expect(new ClientStore().getClient("unknown")).toBeUndefined();
  });

  it("passes a public client without a secret", () => {
    const store = new ClientStore([CONSOLE_CLIENT]);
    expect(store.validateClientSecret("console", undefined)).toBe(true);
  });

  it("checks a confidential client's secret", () => {
    const store = new ClientStore([SERVICE_CLIENT]);
    expect(store.validateClientSecret("service-app", "service-secret")).toBe(true);
    expect(store.validateClientSecret("service-app", "service-secreT")).toBe(false);
    expect(store.validateClientSecret("service-app", "service-secret-and-more")).toBe(false);
    expect(store.validateClientSecret("service-app", undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Development credentials must not exist in production
// ---------------------------------------------------------------------------

/**
 * The development clients and accounts are published in this repository and
 * carry platform roles, so in production they must convey nothing at all.
 */
describe("development credentials under NODE_ENV=production", () => {
  async function productionServer() {
    const app = await createServer({ config: testConfig({ nodeEnv: "production" }) });
    await app.ready();
    return app;
  }

  it("seeds no development client", () => {
    const store = createClientStore({ nodeEnv: "production", declared: [] });
    for (const client of DEV_CLIENTS) {
      expect(store.getClient(client.clientId)).toBeUndefined();
    }
  });

  it("keeps the operator's declared clients", () => {
    const store = createClientStore({ nodeEnv: "production", declared: [CONSOLE_CLIENT] });
    expect(store.getClient("console")).toEqual(CONSOLE_CLIENT);
  });

  it("rejects the published client credentials", async () => {
    const app = await productionServer();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/multipass/api/oauth2/token",
        payload: { grant_type: "client_credentials", client_id: "admin", client_secret: "admin123" },
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("rejects the published account passwords", async () => {
    const app = await productionServer();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/multipass/api/auth/login",
        payload: { username: "admin", password: "admin123" },
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("still accepts both in development", async () => {
    const app = await createServer({ config: testConfig({ nodeEnv: "test" }) });
    await app.ready();
    try {
      const token = await app.inject({
        method: "POST",
        url: "/multipass/api/oauth2/token",
        payload: { grant_type: "client_credentials", client_id: "admin", client_secret: "admin123" },
      });
      expect(token.statusCode).toBe(200);
      expect(decodeJwt(token.json().access_token).roles).toBe("ADMIN");

      const login = await app.inject({
        method: "POST",
        url: "/multipass/api/auth/login",
        payload: { username: "developer", password: "dev123" },
      });
      expect(login.statusCode).toBe(200);
      // The development user holds no platform role: access is a role on a resource.
      expect(decodeJwt(login.json().accessToken).roles).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("fails to start on a malformed OAUTH_CLIENTS rather than run without it", async () => {
    await expect(
      createServer({ config: testConfig({ oauthClients: '[{"clientId": "x", "grantTypes": ["implicit"]}]' }) }),
    ).rejects.toThrow(/unsupported grant type "implicit"/);
  });
});

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

describe("token endpoint", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startServer();
  });

  afterEach(async () => {
    await server.app.close();
  });

  function token(payload: Record<string, unknown>) {
    return server.app.inject({ method: "POST", url: "/multipass/api/oauth2/token", payload });
  }

  it("issues a client_credentials token, and no refresh token with it", async () => {
    const response = await token({
      grant_type: "client_credentials",
      client_id: "service-app",
      client_secret: "service-secret",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.access_token).toBeTruthy();
    expect(body.token_type).toBe("bearer");
    expect(body.expires_in).toBe(3600);
    expect(body.scope).toBe("api:read api:write");
    expect(body.refresh_token).toBeUndefined();
    expect(decodeJwt(body.access_token).sub).toBe("service:service-app");
  });

  it("gives no refresh token to client_credentials even when the client declares that grant", async () => {
    server.clientStore.registerClient({
      ...SERVICE_CLIENT,
      clientId: "sync",
      grantTypes: ["client_credentials", "refresh_token"],
    });

    const response = await token({
      grant_type: "client_credentials",
      client_id: "sync",
      client_secret: "service-secret",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().access_token).toBeTruthy();
    expect(response.json().refresh_token).toBeUndefined();
  });

  it("grants a declared client's legacy EDITOR as editor on the platform root", async () => {
    const authorizationStore = new FileAuthorizationStore(null);
    const app = await createServer({
      config: testConfig({
        oauthClients: JSON.stringify([{ clientId: "sync", clientSecret: "s3cret", roles: ["EDITOR"] }]),
      }),
      users: new InMemoryUserDirectory(),
      authorizationStore,
    });
    try {
      expect(await authorizationStore.listGrants(ROOT_RESOURCE)).toMatchObject([
        { principalType: "user", principalId: "service:sync", roleId: "editor" },
      ]);
      const response = await app.inject({
        method: "POST",
        url: "/multipass/api/oauth2/token",
        payload: { grant_type: "client_credentials", client_id: "sync", client_secret: "s3cret" },
      });
      expect(response.statusCode).toBe(200);
      const claims = decodeJwt(response.json().access_token);
      expect(claims.sub).toBe("service:sync");
      expect(claims.roles).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("takes back a legacy grant once the client no longer declares it, and leaves an operator's grant", async () => {
    const authorizationStore = new FileAuthorizationStore(null);
    const start = async (clients: unknown[]) =>
      (
        await createServer({
          config: testConfig({ oauthClients: JSON.stringify(clients) }),
          users: new InMemoryUserDirectory(),
          authorizationStore,
        })
      ).close();
    await authorizationStore.addGrant({
      resourceRid: ROOT_RESOURCE,
      principalType: "user",
      principalId: "service:ops",
      roleId: "viewer",
      grantedBy: "root",
      grantedAt: "2026-01-01T00:00:00.000Z",
    });

    await start([
      { clientId: "sync", clientSecret: "s3cret", roles: ["EDITOR", "VIEWER"] },
      { clientId: "ops", clientSecret: "s3cret", roles: ["EDITOR"] },
    ]);
    const held = async () =>
      (await authorizationStore.listGrants(ROOT_RESOURCE)).map((g) => `${g.principalId}:${g.roleId}`).sort();
    expect(await held()).toEqual(["service:ops:editor", "service:ops:viewer", "service:sync:editor", "service:sync:viewer"]);

    await start([{ clientId: "sync", clientSecret: "s3cret", roles: ["VIEWER"] }]);
    expect(await held()).toEqual(["service:ops:viewer", "service:sync:viewer"]);
  });

  it("puts the client's own roles on a client_credentials token", async () => {
    server.clientStore.registerClient({ ...SERVICE_CLIENT, clientId: "roleful", roles: ["SERVICE_ACCOUNT"] });

    const response = await token({
      grant_type: "client_credentials",
      client_id: "roleful",
      client_secret: "service-secret",
    });

    expect(response.statusCode).toBe(200);
    expect(decodeJwt(response.json().access_token).roles).toBe("SERVICE_ACCOUNT");
  });

  it("rejects client_credentials with a wrong secret or from a public client", async () => {
    expect((await token({
      grant_type: "client_credentials",
      client_id: "service-app",
      client_secret: "wrong",
    })).statusCode).toBe(400);
    expect((await token({ grant_type: "client_credentials", client_id: "console" })).statusCode)
      .toBe(400);
  });

  it("rotates a refresh token and refuses the old one", async () => {
    const { refresh_token } = (await signInAndExchange(server.app)).json();
    const refresh = () =>
      token({ grant_type: "refresh_token", client_id: "console", refresh_token });

    const first = await refresh();
    expect(first.statusCode).toBe(200);
    expect(first.json().refresh_token).not.toBe(refresh_token);
    expect((await refresh()).statusCode).toBe(400);
  });

  it("refuses a refresh that names no client", async () => {
    const { refresh_token } = (await signInAndExchange(server.app)).json();
    expect((await token({ grant_type: "refresh_token", refresh_token })).statusCode).toBe(400);
  });

  it("revokes a refresh token", async () => {
    const { refresh_token } = (await signInAndExchange(server.app)).json();

    const revoke = await server.app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/revoke",
      payload: { token: refresh_token },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().revoked).toBe(true);

    expect((await token({ grant_type: "refresh_token", client_id: "console", refresh_token })).statusCode)
      .toBe(400);
  });

  it("returns user info from a valid token", async () => {
    const { access_token } = (await signInAndExchange(server.app)).json();

    const response = await server.app.inject({
      method: "GET",
      url: "/multipass/api/userinfo",
      headers: { authorization: `Bearer ${access_token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sub: "alice",
      scope: "api:read",
      org: "org:acme",
      svc: "multipass",
    });
  });

  it("verifies a password-login token at userinfo too, with the same key", async () => {
    const login = await server.app.inject({
      method: "POST",
      url: "/multipass/api/auth/login",
      payload: { username: "carol", password: "carol-password" },
    });
    expect(login.statusCode).toBe(200);

    const response = await server.app.inject({
      method: "GET",
      url: "/multipass/api/userinfo",
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().sub).toBe("carol");
  });

  it("returns 401 for userinfo without a token", async () => {
    const response = await server.app.inject({ method: "GET", url: "/multipass/api/userinfo" });
    expect(response.statusCode).toBe(401);
  });

  it("advertises S256 as the only PKCE method", async () => {
    const response = await server.app.inject({ method: "GET", url: "/.well-known/openid-configuration" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.issuer).toBe("openfoundry-multipass");
    expect(body.authorization_endpoint).toContain("/multipass/api/oauth2/authorize");
    expect(body.token_endpoint).toContain("/multipass/api/oauth2/token");
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("returns 400 for an invalid grant type", async () => {
    const response = await token({ grant_type: "password", client_id: "console" });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorName).toBe("InvalidArgument");
  });

  it("returns health check responses", async () => {
    const health = await server.app.inject({ method: "GET", url: "/status/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe("HEALTHY");
    expect((await server.app.inject({ method: "GET", url: "/status/liveness" })).statusCode).toBe(200);
    expect((await server.app.inject({ method: "GET", url: "/status/readiness" })).statusCode).toBe(200);
  });
});
