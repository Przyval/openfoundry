import { describe, expect, it, vi } from "vitest";
import {
  HealthStatus,
  type HealthCheckResult,
  combineHealthChecks,
  HealthChecker,
  createDatabaseCheck,
  createHttpCheck,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// HealthStatus & combineHealthChecks
// ---------------------------------------------------------------------------

describe("combineHealthChecks", () => {
  it("returns HEALTHY when all checks are healthy", () => {
    const result = combineHealthChecks({
      db: { status: HealthStatus.HEALTHY, timestamp: new Date() },
      cache: { status: HealthStatus.HEALTHY, timestamp: new Date() },
    });

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.details).toHaveProperty("db");
    expect(result.details).toHaveProperty("cache");
  });

  it("returns the worst status among checks", () => {
    const result = combineHealthChecks({
      db: { status: HealthStatus.HEALTHY, timestamp: new Date() },
      cache: { status: HealthStatus.WARNING, timestamp: new Date() },
      search: { status: HealthStatus.ERROR, timestamp: new Date() },
    });

    expect(result.status).toBe(HealthStatus.ERROR);
  });

  it("handles TERMINAL as more severe than ERROR", () => {
    const result = combineHealthChecks({
      a: { status: HealthStatus.ERROR, timestamp: new Date() },
      b: { status: HealthStatus.TERMINAL, timestamp: new Date() },
    });

    expect(result.status).toBe(HealthStatus.TERMINAL);
  });

  it("handles SUSPENDED as the most severe status", () => {
    const result = combineHealthChecks({
      a: { status: HealthStatus.TERMINAL, timestamp: new Date() },
      b: { status: HealthStatus.SUSPENDED, timestamp: new Date() },
    });

    expect(result.status).toBe(HealthStatus.SUSPENDED);
  });

  it("returns HEALTHY with empty details when no checks are provided", () => {
    const result = combineHealthChecks({});

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.details).toEqual({});
  });

  it("preserves individual check messages in details", () => {
    const result = combineHealthChecks({
      db: { status: HealthStatus.HEALTHY, message: "DB OK", timestamp: new Date() },
      cache: { status: HealthStatus.WARNING, message: "High latency", timestamp: new Date() },
    });

    expect(result.details!["db"].message).toBe("DB OK");
    expect(result.details!["cache"].message).toBe("High latency");
  });
});

// ---------------------------------------------------------------------------
// HealthChecker
// ---------------------------------------------------------------------------

describe("HealthChecker", () => {
  it("registers and runs checks", async () => {
    const checker = new HealthChecker();
    checker.registerCheck("test", async () => ({
      status: HealthStatus.HEALTHY,
      timestamp: new Date(),
    }));

    const result = await checker.runChecks();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.details).toHaveProperty("test");
  });

  it("catches check failures and reports ERROR status", async () => {
    const checker = new HealthChecker();
    checker.registerCheck("failing", async () => {
      throw new Error("Connection refused");
    });

    const result = await checker.runChecks();

    expect(result.status).toBe(HealthStatus.ERROR);
    expect(result.details!["failing"].message).toContain("Connection refused");
  });

  it("runs multiple checks in parallel", async () => {
    const checker = new HealthChecker();
    const order: string[] = [];

    checker.registerCheck("slow", async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push("slow");
      return { status: HealthStatus.HEALTHY, timestamp: new Date() };
    });

    checker.registerCheck("fast", async () => {
      order.push("fast");
      return { status: HealthStatus.HEALTHY, timestamp: new Date() };
    });

    const result = await checker.runChecks();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    // fast should complete before slow since they run in parallel
    expect(order[0]).toBe("fast");
    expect(order[1]).toBe("slow");
  });
});

// ---------------------------------------------------------------------------
// Check factories
// ---------------------------------------------------------------------------

describe("createDatabaseCheck", () => {
  it("returns HEALTHY when queryFn succeeds", async () => {
    const check = createDatabaseCheck(async () => {});
    const result = await check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.message).toContain("Database connection OK");
  });

  it("returns ERROR when queryFn throws", async () => {
    const check = createDatabaseCheck(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await check();

    expect(result.status).toBe(HealthStatus.ERROR);
    expect(result.message).toContain("ECONNREFUSED");
  });
});

describe("createHttpCheck", () => {
  it("returns HEALTHY for a successful response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", mockFetch);

    const check = createHttpCheck("https://example.com/health");
    const result = await check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.message).toContain("200");

    vi.unstubAllGlobals();
  });

  it("returns ERROR when fetch fails", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const check = createHttpCheck("https://example.com/health");
    const result = await check();

    expect(result.status).toBe(HealthStatus.ERROR);
    expect(result.message).toContain("Network error");

    vi.unstubAllGlobals();
  });
});
