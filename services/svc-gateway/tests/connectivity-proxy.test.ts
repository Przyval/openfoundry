/**
 * The connectivity section is only reachable if the gateway forwards it to
 * svc-datasets. Each served shape is asserted by the URL the gateway fetched.
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

const C = "ri.magritte.main.source.c1";

describe("connectivity gateway routing", () => {
  it("sends every served connectivity operation to svc-datasets with its query string", async () => {
    const cases: [method: "GET" | "POST" | "PUT" | "DELETE", path: string, payload?: object][] = [
      ["POST", "/api/v2/connectivity/connections?preview=true", { a: 1 }],
      ["GET", `/api/v2/connectivity/connections/${C}?preview=true`],
      ["GET", `/api/v2/connectivity/connections/${C}/getConfiguration?preview=true`],
      ["POST", "/api/v2/connectivity/connections/getConfigurationBatch?preview=true", [{ a: 1 }]],
      ["POST", `/api/v2/connectivity/connections/${C}/updateExportSettings?preview=true`, { a: 1 }],
      ["POST", `/api/v2/connectivity/connections/${C}/updateSecrets?preview=true`, { a: 1 }],
      ["POST", `/api/v2/connectivity/connections/${C}/fileImports?preview=true`, { a: 1 }],
      ["GET", `/api/v2/connectivity/connections/${C}/fileImports?preview=true&pageSize=2`],
      ["PUT", `/api/v2/connectivity/connections/${C}/tableImports/t1?preview=true`, { a: 1 }],
      ["DELETE", `/api/v2/connectivity/connections/${C}/tableImports/t1?preview=true`],
      ["POST", `/api/v2/connectivity/connections/${C}/virtualTables?preview=true`, { a: 1 }],
    ];
    for (const [method, path, payload] of cases) {
      vi.mocked(globalThis.fetch).mockClear();
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
      const app = await createServer({ config: TEST_CONFIG });
      const res = await app.inject({ method, url: path, ...(payload ? { payload } : {}) });
      await app.close();
      expect(res.statusCode).toBe(200);
      expect(String(vi.mocked(globalThis.fetch).mock.calls[0]![0])).toBe(
        `http://mock-datasets:8085${path}`,
      );
    }
  });

  it("forwards a driver jar byte for byte", async () => {
    const jar = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0xfe, 0x80]);
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/connectivity/connections/${C}/uploadCustomJdbcDrivers?preview=true&fileName=a.jar`,
      headers: { "content-type": "application/octet-stream" },
      payload: jar,
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as { body: Buffer };
    expect(Buffer.from(init.body).equals(jar)).toBe(true);
  });
});
