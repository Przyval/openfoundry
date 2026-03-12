import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Test config — no auth key so JWT verification is disabled
// ---------------------------------------------------------------------------

const TEST_CONFIG: GatewayConfig = {
  port: 0,
  host: "127.0.0.1",
  authPublicKey: "",
  authIssuer: "test",
  authAudience: "test",
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
// Tests
// ---------------------------------------------------------------------------

describe("health endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer({ config: TEST_CONFIG });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /status/health returns HEALTHY", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/status/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "HEALTHY" });
  });

  it("GET /status/liveness returns HEALTHY", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/status/liveness",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "HEALTHY" });
  });

  it("GET /status/readiness returns HEALTHY", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/status/readiness",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "HEALTHY" });
  });

  it("health endpoints do not require auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/status/health",
      headers: {},
    });

    expect(response.statusCode).toBe(200);
  });

  it("health responses include X-Request-Id header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/status/health",
    });

    const requestId = response.headers["x-request-id"];
    expect(requestId).toBeDefined();
    expect(typeof requestId).toBe("string");
  });

  it("preserves client-provided X-Request-Id", async () => {
    const clientId = "test-request-id-12345";
    const response = await app.inject({
      method: "GET",
      url: "/status/health",
      headers: { "x-request-id": clientId },
    });

    expect(response.headers["x-request-id"]).toBe(clientId);
  });
});

describe("v2 proxy routes (upstream down)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer({ config: TEST_CONFIG });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v2/ontologies returns error when upstream is down", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
    });

    // Upstream is not running — expect a 5xx error
    expect(response.statusCode).toBeGreaterThanOrEqual(500);
  });

  it("GET /api/v2/datasets returns error when upstream is down", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v2/datasets",
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
  });

  it("GET /api/v2/admin/users returns error when upstream is down", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
  });

  it("error responses include error information", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
    });

    const body = response.json();
    expect(body).toHaveProperty("errorCode");
  });
});
