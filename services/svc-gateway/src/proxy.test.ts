import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "./server.js";
import type { GatewayConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Test config
// ---------------------------------------------------------------------------

const TEST_CONFIG: GatewayConfig = {
  port: 0,
  host: "127.0.0.1",
  authPublicKey: "", // disable auth for tests
  authIssuer: "test",
  authAudience: "test",
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
  rateLimit: {
    enabled: false,
    maxRequests: 100,
    windowMs: 60_000,
  },
  logLevel: "silent",
  nodeEnv: "test",
};

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gateway proxy routing", () => {
  it("proxies GET /api/v2/ontologies to svc-ontology", async () => {
    const mockResponse = new Response(JSON.stringify({ data: [{ rid: "ri.ontology.1" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: [{ rid: "ri.ontology.1" }] });

    // Verify fetch was called with the correct upstream URL
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(calledUrl).toContain("mock-ontology:8081");
  });

  it("proxies POST /api/v2/ontologies/ri.123/objectTypes to svc-ontology", async () => {
    const mockResponse = new Response(JSON.stringify({ apiName: "Employee" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies/ri.123/objectTypes",
      headers: { "content-type": "application/json" },
      payload: { apiName: "Employee" },
    });

    expect(res.statusCode).toBe(201);

    // Verify the body was forwarded
    const [, fetchOptions] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(JSON.parse((fetchOptions as RequestInit).body as string)).toEqual({
      apiName: "Employee",
    });
  });

  it("proxies GET /api/v2/datasets to svc-datasets", async () => {
    const mockResponse = new Response(JSON.stringify({ datasets: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/datasets",
    });

    expect(res.statusCode).toBe(200);
    const [calledUrl] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(calledUrl).toContain("mock-datasets:8085");
  });

  it("proxies GET /api/v2/admin/users to svc-admin", async () => {
    const mockResponse = new Response(JSON.stringify({ users: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
    });

    expect(res.statusCode).toBe(200);
    const [calledUrl] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(calledUrl).toContain("mock-admin:8087");
  });

  it("proxies /multipass routes to svc-multipass", async () => {
    const mockResponse = new Response(JSON.stringify({ token: "abc" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "POST",
      url: "/multipass/api/oauth2/token",
      headers: { "content-type": "application/json" },
      payload: { grant_type: "client_credentials" },
    });

    expect(res.statusCode).toBe(200);
    const [calledUrl] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(calledUrl).toContain("mock-multipass:8084");
  });

  it("returns 502 when upstream is unreachable", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
    });

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).errorCode).toBe("BAD_GATEWAY");
  });

  it("forwards X-Request-Id header to upstream", async () => {
    const mockResponse = new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: { "x-request-id": "test-req-123" },
    });

    const [, fetchOptions] = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-request-id"]).toBeDefined();
  });

  it("forwards X-Forwarded-For header to upstream", async () => {
    const mockResponse = new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
    });

    const [, fetchOptions] = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = (fetchOptions as RequestInit).headers as Record<string, string>;
    expect(headers["x-forwarded-for"]).toBeDefined();
  });

  it("strips upstream hop-by-hop headers from response", async () => {
    const mockResponse = new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-custom-header": "should-pass-through",
        "proxy-authenticate": "Basic",
      },
    });
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockResponse);

    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
    });

    // Custom headers should pass through
    expect(res.headers["x-custom-header"]).toBe("should-pass-through");
    // Hop-by-hop headers from upstream should be stripped
    expect(res.headers["proxy-authenticate"]).toBeUndefined();
  });
});
