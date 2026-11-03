/**
 * The gateway is the only thing allowed to say who a caller is.
 *
 * Downstream services read the caller from `x-user-*` headers
 * (packages/permissions/src/identity.ts). Those headers used to arrive straight
 * from the client, so anyone could claim to be ADMIN. They are dropped on the
 * way in, and the gateway writes them itself from the token it verified.
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

  it("are replaced by the verified token's identity, never merged with it", async () => {
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
    expect(headers["x-user-platform-admin"]).toBeUndefined();
    expect(headers["x-user-roles"]).toBeUndefined();
    await app.close();
  });
});

describe("the gateway's own identity headers", () => {
  it("state the caller, Organization, groups and Markings of the verified token", async () => {
    const app = await createServer({ config: configWith(publicKeyPem) });
    const token = await signToken({ sub: "carol", groups: "analysts finance", markings: "pii" });

    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${token}` },
    });

    const headers = forwardedHeaders();
    expect(headers["x-user-id"]).toBe("carol");
    expect(headers["x-user-org"]).toBe("org-1");
    expect(headers["x-user-groups"]).toBe("analysts,finance");
    expect(headers["x-user-markings"]).toBe("pii");
    expect(headers["x-user-platform-admin"]).toBeUndefined();
    await app.close();
  });

  it("mark a platform administrator only for the ADMIN role", async () => {
    const app = await createServer({ config: configWith(publicKeyPem) });
    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { authorization: `Bearer ${await signToken({ sub: "ada", roles: "ADMIN" })}` },
    });

    expect(forwardedHeaders()["x-user-platform-admin"]).toBe("true");
    await app.close();
  });

  it("are absent when the gateway verifies no token", async () => {
    const app = await createServer({ config: configWith("") });
    await app.inject({ method: "GET", url: "/api/v2/ontologies" });

    const headers = forwardedHeaders();
    expect(Object.keys(headers).some((k) => k.startsWith("x-user-"))).toBe(false);
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
