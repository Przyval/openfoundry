/**
 * Which backend each `/api/v1` request reaches.
 *
 * The ontology namespace is split three ways, so a mis-routed prefix answers
 * 404 from a service that simply does not have the route — which is what the v2
 * proxy does today for `applyBatch`. Each case asserts the URL the gateway
 * actually fetched.
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

const ONTOLOGY = "ri.ontology.main.ontology.test";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Sends one request through the gateway and reports the URL it forwarded to. */
async function forwardedUrl(
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: object,
): Promise<string> {
  vi.mocked(globalThis.fetch).mockClear();
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  const app = await createServer({ config: TEST_CONFIG });
  const res = await app.inject({
    method,
    url,
    ...(payload ? { payload } : {}),
  });

  expect(res.statusCode).toBe(200);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  return String(vi.mocked(globalThis.fetch).mock.calls[0][0]);
}

describe("v1 gateway routing", () => {
  it("sends dataset operations to svc-datasets", async () => {
    expect(await forwardedUrl("GET", "/api/v1/datasets/ri.datasets.main.dataset.1")).toBe(
      "http://mock-datasets:8085/api/v1/datasets/ri.datasets.main.dataset.1",
    );
    expect(
      await forwardedUrl("POST", "/api/v1/datasets", {
        name: "sales",
        parentFolderRid: "ri.compass.main.folder.root",
      }),
    ).toBe("http://mock-datasets:8085/api/v1/datasets");
  });

  it("sends ontology metadata to svc-ontology", async () => {
    expect(await forwardedUrl("GET", "/api/v1/ontologies")).toBe(
      "http://mock-ontology:8081/api/v1/ontologies",
    );
    expect(
      await forwardedUrl("GET", `/api/v1/ontologies/${ONTOLOGY}/objectTypes`),
    ).toBe(`http://mock-ontology:8081/api/v1/ontologies/${ONTOLOGY}/objectTypes`);
    expect(
      await forwardedUrl("GET", `/api/v1/ontologies/${ONTOLOGY}/queryTypes`),
    ).toBe(`http://mock-ontology:8081/api/v1/ontologies/${ONTOLOGY}/queryTypes`);
  });

  it("sends object reads and searches to svc-objects", async () => {
    expect(
      await forwardedUrl("GET", `/api/v1/ontologies/${ONTOLOGY}/objects/Employee`),
    ).toBe(`http://mock-objects:8082/api/v1/ontologies/${ONTOLOGY}/objects/Employee`);
    expect(
      await forwardedUrl(
        "POST",
        `/api/v1/ontologies/${ONTOLOGY}/objects/Employee/search`,
        { query: { type: "eq", field: "name", value: "Ada" }, fields: ["name"] },
      ),
    ).toBe(
      `http://mock-objects:8082/api/v1/ontologies/${ONTOLOGY}/objects/Employee/search`,
    );
  });

  it("sends every action operation to svc-actions, applyBatch included", async () => {
    // The v2 proxy anchors its pattern on `/(apply|validate)$`, which
    // `/applyBatch` does not end with, so v2's batch apply reaches svc-ontology
    // instead. v1 matches all three.
    for (const operation of ["apply", "applyBatch", "validate"]) {
      expect(
        await forwardedUrl(
          "POST",
          `/api/v1/ontologies/${ONTOLOGY}/actions/promote/${operation}`,
          { parameters: {} },
        ),
      ).toBe(
        `http://mock-actions:8083/api/v1/ontologies/${ONTOLOGY}/actions/promote/${operation}`,
      );
    }
  });

  it("does not proxy v1 attachments, which no backend serves", async () => {
    // A registered prefix with no backend would answer 502; the honest answer
    // for an operation OpenFoundry does not implement is a 404.
    const app = await createServer({ config: TEST_CONFIG });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/attachments/ri.ontology.main.attachment.1",
    });

    expect(res.statusCode).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
