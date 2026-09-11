/**
 * The gateway is the only thing allowed to say who a caller is.
 *
 * Downstream services read `X-User-Id` / `X-User-Roles` as identity
 * (packages/permissions/src/middleware.ts). Those headers used to arrive
 * straight from the client, so anyone could claim to be ADMIN. Here they are
 * dropped on the way in and re-asserted from the verified JWT claims.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { generateKeyPair, exportSPKI, exportPKCS8, importPKCS8 } from "jose";
import { createToken, buildTokenInput } from "@openfoundry/auth-tokens";
import { createServer } from "../src/server.js";
import type { GatewayConfig } from "../src/config.js";

const ISSUER = "openfoundry-multipass";
const AUDIENCE = "openfoundry-api";

function configWith(authPublicKey: string): GatewayConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    authPublicKey,
    authIssuer: ISSUER,
    authAudience: AUDIENCE,
    services: {
      multipass: "http://mock-multipass:8084",
      ontology: "http://mock-ontology:8081",
      objects: "http://mock-objects:8082",
      actions: "http://mock-actions:8083",
      datasets: "http://mock-datasets:8085",
      compass: "http://mock-compass:8086",
      admin: "http://mock-admin:8087",
      functions: "http://mock-functions:8088",
      webhooks: "http://mock-webhooks:8089",
      media: "http://mock-media:8090",
      sentinel: "http://mock-sentinel:8091",
      aip: "http://mock-aip:8092",
    },
    rateLimit: { enabled: false, maxRequests: 100, windowMs: 60_000 },
    logLevel: "silent",
    nodeEnv: "test",
  };
}

let publicKeyPem: string;
let privateKeyPem: string;

async function signToken(overrides: Record<string, unknown> = {}): Promise<string> {
  const key = await importPKCS8(privateKeyPem, "ES256");
  return createToken(
    buildTokenInput({
      sub: "alice",
      sid: "session-1",
      jti: "token-1",
      org: "org-1",
      svc: "multipass",
      iss: ISSUER,
      aud: AUDIENCE,
      scope: "api:read api:write",
      ...overrides,
    }),
    key,
  );
}

/** Headers the proxy sent upstream on the single mocked call. */
function forwardedHeaders(): Record<string, string> {
  const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
  return (init as RequestInit).headers as Record<string, string>;
}

const originalFetch = globalThis.fetch;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  publicKeyPem = await exportSPKI(pair.publicKey);
  privateKeyPem = await exportPKCS8(pair.privateKey);
});

beforeEach(() => {
  globalThis.fetch = vi.fn();
  vi.mocked(globalThis.fetch).mockResolvedValue(
    new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------

describe("client-supplied identity headers", () => {
  it("are dropped even when the gateway has no claims to replace them", async () => {
    const app = await createServer({ config: configWith("") });
    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { "x-user-id": "mallory", "x-user-roles": "ADMIN" },
    });

    const headers = forwardedHeaders();
    expect(headers["x-user-id"]).toBeUndefined();
    expect(headers["x-user-roles"]).toBeUndefined();
    await app.close();
  });

  it("cannot override the identity carried by a valid token", async () => {
    const app = await createServer({ config: configWith(publicKeyPem) });
    const token = await signToken({ roles: "VIEWER" });

    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: {
        authorization: `Bearer ${token}`,
        "x-user-id": "mallory",
        "x-user-roles": "ADMIN",
      },
    });

    const headers = forwardedHeaders();
    expect(headers["x-user-id"]).toBe("alice");
    expect(headers["x-user-roles"]).toBe("VIEWER");
    await app.close();
  });
});

describe("identity asserted from verified claims", () => {
  it("is forwarded when the token carries roles", async () => {
    const app = await createServer({ config: configWith(publicKeyPem) });
    const token = await signToken({ sub: "service:admin", roles: "ADMIN" });

    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });

    const headers = forwardedHeaders();
    expect(headers["x-user-id"]).toBe("service:admin");
    expect(headers["x-user-roles"]).toBe("ADMIN");
    await app.close();
  });

  it("is omitted entirely when the token carries no roles claim", async () => {
    // A half-filled identity (id, no roles) is a 403 downstream, so a roleless
    // token must travel with neither header rather than with one.
    const app = await createServer({ config: configWith(publicKeyPem) });
    const token = await signToken();

    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });

    const headers = forwardedHeaders();
    expect(headers["x-user-id"]).toBeUndefined();
    expect(headers["x-user-roles"]).toBeUndefined();
    await app.close();
  });

  it("does not forward a Content-Length that no longer fits the body", async () => {
    // The body is re-serialised from Fastify's parsed form, so a
    // pretty-printed payload shrinks. Forwarding the original length made
    // undici refuse the request and the gateway answer 502.
    const app = await createServer({ config: configWith("") });
    const pretty = JSON.stringify({ name: "monitor" }, null, 4);

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(pretty)),
      },
      payload: pretty,
    });

    expect(res.statusCode).not.toBe(502);
    const headers = forwardedHeaders();
    expect(headers["content-length"]).toBeUndefined();
    await app.close();
  });

  it("still forwards the Authorization header downstream", async () => {
    const app = await createServer({ config: configWith(publicKeyPem) });
    const token = await signToken({ roles: "ADMIN" });

    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(forwardedHeaders()["authorization"]).toBe(`Bearer ${token}`);
    await app.close();
  });
});
