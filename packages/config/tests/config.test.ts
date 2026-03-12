import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG } from "../src/config-schema.js";
import { loadConfig, deepMerge } from "../src/config-loader.js";
import { applyEnvOverrides, ENV_MAP } from "../src/env-mapping.js";

describe("DEFAULT_CONFIG", () => {
  it("has sensible default port", () => {
    expect(DEFAULT_CONFIG.server.port).toBe(3000);
  });

  it("has sensible default host", () => {
    expect(DEFAULT_CONFIG.server.host).toBe("0.0.0.0");
  });

  it("has info as default log level", () => {
    expect(DEFAULT_CONFIG.server.logLevel).toBe("info");
  });

  it("has default database pool size of 10", () => {
    expect(DEFAULT_CONFIG.database.poolSize).toBe(10);
  });

  it("has default token expiry of 3600 seconds", () => {
    expect(DEFAULT_CONFIG.auth.tokenExpirySeconds).toBe(3600);
  });
});

describe("deepMerge", () => {
  it("merges flat objects", () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it("deeply merges nested objects", () => {
    const target = { nested: { a: 1, b: 2 } };
    const source = { nested: { b: 3 } };
    const result = deepMerge(target, source as Partial<typeof target>);
    expect(result).toEqual({ nested: { a: 1, b: 3 } });
  });

  it("does not mutate the target", () => {
    const target = { a: 1 };
    const source = { a: 2 };
    deepMerge(target, source);
    expect(target.a).toBe(1);
  });

  it("overwrites arrays instead of merging them", () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source);
    expect(result.items).toEqual([4, 5]);
  });
});

describe("applyEnvOverrides", () => {
  it("applies port from environment variable", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, {
      OPENFOUNDRY_PORT: "8080",
    });
    expect(result.server.port).toBe(8080);
  });

  it("coerces string port to number", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, {
      OPENFOUNDRY_PORT: "8080",
    });
    expect(typeof result.server.port).toBe("number");
    expect(result.server.port).toBe(8080);
  });

  it("applies database URL from environment variable", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, {
      OPENFOUNDRY_DATABASE_URL: "postgresql://prod:5432/openfoundry",
    });
    expect(result.database.url).toBe("postgresql://prod:5432/openfoundry");
  });

  it("applies boolean ssl from environment variable", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, {
      OPENFOUNDRY_DATABASE_SSL: "true",
    });
    expect(result.database.ssl).toBe(true);
  });

  it("applies JWT public key from environment variable", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, {
      OPENFOUNDRY_JWT_PUBLIC_KEY: "my-public-key",
    });
    expect(result.auth.jwtPublicKey).toBe("my-public-key");
  });

  it("ignores undefined environment variables", () => {
    const result = applyEnvOverrides(DEFAULT_CONFIG, {
      OPENFOUNDRY_PORT: undefined,
    });
    expect(result.server.port).toBe(DEFAULT_CONFIG.server.port);
  });
});

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "openfoundry-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig({
      configPath: join(tempDir, "nonexistent.json"),
      env: {},
    });
    expect(config.server.port).toBe(DEFAULT_CONFIG.server.port);
    expect(config.database.url).toBe(DEFAULT_CONFIG.database.url);
  });

  it("loads config from file", () => {
    const configPath = join(tempDir, "foundry.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        server: { port: 9090 },
      }),
    );

    const config = loadConfig({ configPath, env: {} });
    expect(config.server.port).toBe(9090);
    // Other defaults should still be present
    expect(config.server.host).toBe(DEFAULT_CONFIG.server.host);
  });

  it("env vars take precedence over config file", () => {
    const configPath = join(tempDir, "foundry.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        server: { port: 9090 },
      }),
    );

    const config = loadConfig({
      configPath,
      env: { OPENFOUNDRY_PORT: "4000" },
    });
    expect(config.server.port).toBe(4000);
  });

  it("merges nested config file values with defaults", () => {
    const configPath = join(tempDir, "foundry.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        database: { ssl: true },
      }),
    );

    const config = loadConfig({ configPath, env: {} });
    expect(config.database.ssl).toBe(true);
    expect(config.database.poolSize).toBe(DEFAULT_CONFIG.database.poolSize);
    expect(config.database.url).toBe(DEFAULT_CONFIG.database.url);
  });
});

describe("ENV_MAP", () => {
  it("has mapping for all expected environment variables", () => {
    expect(ENV_MAP["OPENFOUNDRY_PORT"]).toBeDefined();
    expect(ENV_MAP["OPENFOUNDRY_DATABASE_URL"]).toBeDefined();
    expect(ENV_MAP["OPENFOUNDRY_JWT_PUBLIC_KEY"]).toBeDefined();
    expect(ENV_MAP["OPENFOUNDRY_GATEWAY_URL"]).toBeDefined();
  });
});
