/**
 * The models section is only reachable if the gateway forwards it to svc-aip.
 *
 * The routes exist in svc-aip whether or not the gateway registered the
 * prefix, so no static scan of the sources can tell; each shape is asserted by
 * the URL the gateway actually fetched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import type { GatewayConfig } from "../src/config.js";

const TEST_CONFIG: GatewayConfig = {
  port: 0,
  host: "127.0.0.1",
  authPublicKey: "", // disables auth for tests
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
  rateLimit: { enabled: false, maxRequests: 100, windowMs: 60_000 },
  logLevel: "silent",
  nodeEnv: "test",
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function forwardedUrl(
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: object,
): Promise<string> {
  vi.mocked(globalThis.fetch).mockClear();
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  );

  const app = await createServer({ config: TEST_CONFIG });
  const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  await app.close();

  expect(res.statusCode).toBe(200);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  return String(vi.mocked(globalThis.fetch).mock.calls[0]![0]);
}

const MODEL = "ri.models.main.model.m1";
const VERSION = "ri.models.main.model-version.v1";
const STUDIO = "ri.models.main.model-studio.s1";

describe("models gateway routing", () => {
  it("sends every served models operation to svc-aip with its query string", async () => {
    const cases: [method: "GET" | "POST", path: string, payload?: object][] = [
      ["POST", "/api/v2/models?preview=true", { name: "m" }],
      ["GET", `/api/v2/models/${MODEL}?preview=true`],
      ["POST", `/api/v2/models/${MODEL}/promoteVersion?preview=true`, { b: 1 }],
      ["POST", `/api/v2/models/${MODEL}/versions?preview=true`, { b: 1 }],
      ["GET", `/api/v2/models/${MODEL}/versions/${VERSION}?preview=true`],
      ["GET", `/api/v2/models/${MODEL}/versions?preview=true&branch=dev&pageSize=2`],
      ["POST", "/api/v2/models/modelStudios?preview=true", { name: "s" }],
      ["GET", `/api/v2/models/modelStudios/${STUDIO}?preview=true`],
    ];
    for (const [method, path, payload] of cases) {
      expect(await forwardedUrl(method, path, payload)).toBe(`http://mock-aip:8092${path}`);
    }
  });

  it("forwards a model version carrying a model of several megabytes", async () => {
    const path = `/api/v2/models/${MODEL}/versions?preview=true`;
    const payload = {
      modelFiles: {
        type: "dill",
        serializedModelFunction: Buffer.alloc(5 * 1024 * 1024, 7).toString("base64"),
      },
    };
    expect(await forwardedUrl("POST", path, payload)).toBe(`http://mock-aip:8092${path}`);
  });

  it("keeps the default body limit elsewhere, and reports exceeding it as a 413", async () => {
    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "x".repeat(2 * 1024 * 1024) },
    });
    await app.close();
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ errorCode: "CUSTOM_CLIENT", errorName: "InvalidRequest" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("leaves the existing AIP routes where they were", async () => {
    expect(await forwardedUrl("GET", "/api/v2/aip/conversations")).toBe(
      "http://mock-aip:8092/api/v2/aip/conversations",
    );
  });
});
