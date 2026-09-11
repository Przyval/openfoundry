/**
 * Gateway authentication tests.
 *
 * The regression these pin down: `app.register(authPlugin)` encapsulated the
 * plugin, so its onRequest hook only ever covered routes registered inside
 * that child context - and every route lives on the parent. The gateway
 * therefore served /api/v2/* unauthenticated even with AUTH_PUBLIC_KEY set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateKeyPair, exportSPKI, exportPKCS8, importPKCS8 } from "jose";
import { createToken, buildTokenInput } from "@openfoundry/auth-tokens";
import { createServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** What services/svc-multipass/src/routes/oauth.ts signs into every token. */
const MULTIPASS_ISSUER = "openfoundry-multipass";
const MULTIPASS_AUDIENCE = "openfoundry-api";

const ISSUER = MULTIPASS_ISSUER;
const AUDIENCE = MULTIPASS_AUDIENCE;

function configWith(authPublicKey: string): GatewayConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    authPublicKey,
    authIssuer: ISSUER,
    authAudience: AUDIENCE,
    services: {
      multipass: "http://localhost:19084",
      ontology: "http://localhost:19081",
      objects: "http://localhost:19082",
      actions: "http://localhost:19083",
      datasets: "http://localhost:19085",
      compass: "http://localhost:19086",
      admin: "http://localhost:19087",
      functions: "http://localhost:19088",
      webhooks: "http://localhost:19089",
      media: "http://localhost:19090",
      sentinel: "http://localhost:19091",
      aip: "http://localhost:19092",
    },
    rateLimit: { enabled: false, maxRequests: 100, windowMs: 60_000 },
    logLevel: "silent",
    nodeEnv: "test",
  };
}

let publicKeyPem: string;
let privateKeyPem: string;

async function signToken(
  overrides: Partial<Parameters<typeof buildTokenInput>[0]> = {},
  ttlSeconds = 3600,
): Promise<string> {
  const key = await importPKCS8(privateKeyPem, "ES256");
  const input = buildTokenInput(
    {
      sub: "admin",
      sid: "session-1",
      jti: "token-1",
      org: "org-1",
      svc: "multipass",
      iss: ISSUER,
      aud: AUDIENCE,
      scope: "api:read api:write",
      ...overrides,
    },
    ttlSeconds,
  );
  return createToken(input, key);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  publicKeyPem = await exportSPKI(pair.publicKey);
  privateKeyPem = await exportPKCS8(pair.privateKey);
});

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

describe("with AUTH_PUBLIC_KEY configured", () => {
  let app: FastifyInstance;
  /** What the auth hook attached to the request, recorded per request. */
  let seen: { sub?: string; org?: string } = {};

  beforeAll(async () => {
    app = await createServer({ config: configWith(publicKeyPem) });
    // Hooks must be added before ready(); this one observes what the auth
    // middleware put on the request by the time a route handler runs.
    app.addHook("preHandler", async (request) => {
      seen = { sub: request.claims?.sub, org: request.orgRid };
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects an unauthenticated API request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v2/ontologies" });
    expect(res.statusCode).toBe(401);
    expect(res.json().errorName).toBe("MissingAuthToken");
  });

  it("rejects an unauthenticated v1 API request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ontologies" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a garbage bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().errorName).toBe("InvalidAuthToken");
  });

  it("rejects a token signed by a different key", async () => {
    const stranger = await generateKeyPair("ES256", { extractable: true });
    const token = await createToken(
      buildTokenInput({
        sub: "mallory",
        sid: "s",
        jti: "j",
        org: "org-1",
        svc: "multipass",
        iss: ISSUER,
        aud: AUDIENCE,
        scope: "api:read",
      }),
      stranger.privateKey,
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an expired token", async () => {
    const token = await signToken({}, -60);
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token issued for another audience", async () => {
    const token = await signToken({ aud: "some-other-api" });
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid token and populates claims and orgRid", async () => {
    seen = {};
    const token = await signToken();
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });

    // The ontology service is not running, so the proxy answers 502 - but the
    // request got past auth, which is what this asserts.
    expect(res.statusCode).not.toBe(401);
    expect(seen.sub).toBe("admin");
    expect(seen.org).toBe("org-1");
  });

  it("leaves the health endpoints reachable without a token", async () => {
    for (const url of ["/status/health", "/status/liveness", "/status/readiness"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(200);
    }
  });

  it("guards /metrics like every other route", async () => {
    // Registered by a plugin rather than by a route module, so it is the one
    // endpoint whose coverage depends on how the plugin was wired.
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(401);
  });

  it("leaves the token endpoints reachable without a token", async () => {
    // Nothing is listening upstream, so a 502 is the success signal here:
    // the request was proxied rather than rejected with 401.
    const res = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      payload: { grant_type: "client_credentials" },
    });
    expect(res.statusCode).not.toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Dev mode
// ---------------------------------------------------------------------------

describe("without AUTH_PUBLIC_KEY", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer({ config: configWith("") });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves API requests unauthenticated, as the demo expects", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v2/ontologies" });
    expect(res.statusCode).not.toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Issuer / audience compatibility with svc-multipass
// ---------------------------------------------------------------------------

describe("default config", () => {
  it("expects the issuer svc-multipass actually signs", async () => {
    // Every token this platform mints carries iss "openfoundry-multipass".
    // A gateway default that disagrees rejects all of them, which stayed
    // invisible for as long as the auth hook never ran.
    const previousIssuer = process.env.AUTH_ISSUER;
    const previousAudience = process.env.AUTH_AUDIENCE;
    delete process.env.AUTH_ISSUER;
    delete process.env.AUTH_AUDIENCE;
    try {
      const { loadConfig } = await import("../src/config.js");
      const config = loadConfig();
      expect(config.authIssuer).toBe(MULTIPASS_ISSUER);
      expect(config.authAudience).toBe(MULTIPASS_AUDIENCE);
    } finally {
      if (previousIssuer !== undefined) process.env.AUTH_ISSUER = previousIssuer;
      if (previousAudience !== undefined) process.env.AUTH_AUDIENCE = previousAudience;
    }
  });

  it("treats an empty AUTH_ISSUER as unset rather than as 'verify nothing'", async () => {
    // Blanking the line instead of deleting it must not switch the issuer
    // check off: the middleware maps an empty value to `undefined`, which jose
    // reads as "do not verify this claim".
    const previousIssuer = process.env.AUTH_ISSUER;
    const previousAudience = process.env.AUTH_AUDIENCE;
    process.env.AUTH_ISSUER = "";
    process.env.AUTH_AUDIENCE = "";
    try {
      const { loadConfig } = await import("../src/config.js");
      const config = loadConfig();
      expect(config.authIssuer).toBe(MULTIPASS_ISSUER);
      expect(config.authAudience).toBe(MULTIPASS_AUDIENCE);

      const app = await createServer({
        config: { ...configWith(publicKeyPem), authIssuer: config.authIssuer, authAudience: config.authAudience },
      });
      const foreign = await signToken({ iss: "someone-else" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v2/ontologies",
        headers: { authorization: `Bearer ${foreign}` },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    } finally {
      if (previousIssuer === undefined) delete process.env.AUTH_ISSUER;
      else process.env.AUTH_ISSUER = previousIssuer;
      if (previousAudience === undefined) delete process.env.AUTH_AUDIENCE;
      else process.env.AUTH_AUDIENCE = previousAudience;
    }
  });
});

// ---------------------------------------------------------------------------
// Key handling
// ---------------------------------------------------------------------------

describe("AUTH_PUBLIC_KEY that is not a PEM public key", () => {
  it("fails at startup rather than 401-ing every request", async () => {
    await expect(
      createServer({ config: configWith("change-me-in-production") }),
    ).rejects.toThrow(/PEM block/);
  });
});
