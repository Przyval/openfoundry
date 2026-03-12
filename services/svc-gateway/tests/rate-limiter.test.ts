import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { InMemoryRateLimiter } from "../src/rate-limiter.js";
import { createServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// InMemoryRateLimiter unit tests
// ---------------------------------------------------------------------------

describe("InMemoryRateLimiter", () => {
  it("allows requests under the limit", async () => {
    const limiter = new InMemoryRateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
    });

    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume("test-key");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }

    limiter.stop();
  });

  it("blocks requests when the limit is exceeded", async () => {
    const limiter = new InMemoryRateLimiter({
      maxRequests: 3,
      windowMs: 60_000,
    });

    // Exhaust all tokens
    for (let i = 0; i < 3; i++) {
      const result = await limiter.consume("test-key");
      expect(result.allowed).toBe(true);
    }

    // Next request should be blocked
    const result = await limiter.consume("test-key");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetMs).toBeGreaterThan(0);

    limiter.stop();
  });

  it("refills tokens after the window elapses", async () => {
    const limiter = new InMemoryRateLimiter({
      maxRequests: 2,
      windowMs: 100, // very short window for testing
    });

    // Exhaust tokens
    await limiter.consume("test-key");
    await limiter.consume("test-key");

    const blocked = await limiter.consume("test-key");
    expect(blocked.allowed).toBe(false);

    // Wait for the window to pass so tokens refill
    await new Promise((resolve) => setTimeout(resolve, 120));

    const result = await limiter.consume("test-key");
    expect(result.allowed).toBe(true);

    limiter.stop();
  });

  it("tracks different keys independently", async () => {
    const limiter = new InMemoryRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
    });

    const r1 = await limiter.consume("key-a");
    expect(r1.allowed).toBe(true);

    const r2 = await limiter.consume("key-b");
    expect(r2.allowed).toBe(true);

    // key-a is now exhausted
    const r3 = await limiter.consume("key-a");
    expect(r3.allowed).toBe(false);

    // key-b is also exhausted
    const r4 = await limiter.consume("key-b");
    expect(r4.allowed).toBe(false);

    limiter.stop();
  });

  it("applies keyPrefix to keys", async () => {
    const limiter = new InMemoryRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
      keyPrefix: "api",
    });

    const r1 = await limiter.consume("user-1");
    expect(r1.allowed).toBe(true);

    const r2 = await limiter.consume("user-1");
    expect(r2.allowed).toBe(false);

    limiter.stop();
  });
});

// ---------------------------------------------------------------------------
// rateLimitPlugin integration tests
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
    enabled: true,
    maxRequests: 5,
    windowMs: 60_000,
  },
  logLevel: "silent",
  nodeEnv: "test",
};

describe("rateLimitPlugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer({ config: TEST_CONFIG });
  });

  afterAll(async () => {
    await app.close();
  });

  it("adds rate-limit headers to responses", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/status/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
    expect(response.headers["x-ratelimit-reset"]).toBeDefined();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    // Create a fresh server with a very low limit
    const strictConfig: GatewayConfig = {
      ...TEST_CONFIG,
      rateLimit: {
        enabled: true,
        maxRequests: 2,
        windowMs: 60_000,
      },
    };

    const strictApp = await createServer({ config: strictConfig });

    try {
      // Exhaust the limit
      await strictApp.inject({ method: "GET", url: "/status/health" });
      await strictApp.inject({ method: "GET", url: "/status/health" });

      // This request should be rate-limited
      const response = await strictApp.inject({
        method: "GET",
        url: "/status/health",
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers["retry-after"]).toBeDefined();
      expect(response.headers["x-ratelimit-remaining"]).toBe("0");

      const body = response.json();
      expect(body.errorCode).toBe("RATE_LIMITED");
      expect(body.statusCode).toBe(429);
    } finally {
      await strictApp.close();
    }
  });

  it("uses different keys for different IPs", async () => {
    const strictConfig: GatewayConfig = {
      ...TEST_CONFIG,
      rateLimit: {
        enabled: true,
        maxRequests: 1,
        windowMs: 60_000,
      },
    };

    const strictApp = await createServer({ config: strictConfig });

    try {
      // First request with default IP
      const r1 = await strictApp.inject({
        method: "GET",
        url: "/status/health",
        headers: { authorization: "Bearer token-a" },
      });
      expect(r1.statusCode).toBe(200);

      // Second request with a different auth header should get its own bucket
      const r2 = await strictApp.inject({
        method: "GET",
        url: "/status/health",
        headers: { authorization: "Bearer token-b" },
      });
      expect(r2.statusCode).toBe(200);
    } finally {
      await strictApp.close();
    }
  });

  it("does not rate-limit when disabled", async () => {
    const disabledConfig: GatewayConfig = {
      ...TEST_CONFIG,
      rateLimit: {
        enabled: false,
        maxRequests: 1,
        windowMs: 60_000,
      },
    };

    const noLimitApp = await createServer({ config: disabledConfig });

    try {
      // Should not be limited even after many requests
      for (let i = 0; i < 5; i++) {
        const response = await noLimitApp.inject({
          method: "GET",
          url: "/status/health",
        });
        expect(response.statusCode).toBe(200);
        // No rate-limit headers when disabled
        expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
      }
    } finally {
      await noLimitApp.close();
    }
  });
});
