import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { MonitorStore } from "../src/store/monitor-store.js";
import { ExecutionLog } from "../src/store/execution-log.js";
import { NotificationStore } from "../src/store/notification-store.js";
import { EffectExecutor } from "../src/effects/effect-executor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

function makeMonitor(name: string) {
  return {
    name,
    description: `Monitor: ${name}`,
    objectType: "Employee",
    trigger: {
      type: "OBJECT_CHANGED" as const,
      config: { properties: ["status", "salary"] },
    },
    effects: [
      {
        type: "LOG" as const,
        config: { message: "Object changed" },
      },
      {
        type: "NOTIFICATION" as const,
        config: { message: "Object changed notification", severity: "WARN" },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let monitorStore: MonitorStore;
let executionLog: ExecutionLog;
let notificationStore: NotificationStore;

beforeEach(async () => {
  monitorStore = new MonitorStore();
  executionLog = new ExecutionLog();
  notificationStore = new NotificationStore();
  const effectExecutor = new EffectExecutor(notificationStore);
  app = await createServer({
    config: TEST_CONFIG,
    monitorStore,
    executionLog,
    notificationStore,
    effectExecutor,
  });
});

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

describe("Health endpoints", () => {
  it("GET /status/health returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });
});

// -------------------------------------------------------------------------
// Monitor CRUD
// -------------------------------------------------------------------------

describe("Monitor CRUD", () => {
  it("POST /api/v2/monitors creates a monitor", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("salary-watch"),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("salary-watch");
    expect(body.rid).toMatch(/^ri\./);
    expect(body.status).toBe("ACTIVE");
    expect(body.trigger.type).toBe("OBJECT_CHANGED");
    expect(body.effects).toHaveLength(2);
  });

  it("GET /api/v2/monitors lists monitors", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("mon-a"),
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("mon-b"),
    });

    const res = await app.inject({ method: "GET", url: "/api/v2/monitors" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET /api/v2/monitors/:monitorRid returns a monitor", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("get-mon"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/monitors/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("get-mon");
  });

  it("GET /api/v2/monitors/:monitorRid returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/monitors/ri.sentinel.main.monitor.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /api/v2/monitors/:monitorRid updates a monitor", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("update-mon"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/monitors/${rid}`,
      payload: { name: "renamed-mon", status: "PAUSED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("renamed-mon");
    expect(res.json().status).toBe("PAUSED");
  });

  it("DELETE /api/v2/monitors/:monitorRid deletes a monitor", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("delete-mon"),
    });
    const rid = createRes.json().rid;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/monitors/${rid}`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/monitors/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("POST /api/v2/monitors returns 409 for duplicate name", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("dup-mon"),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("dup-mon"),
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Trigger and execution
// -------------------------------------------------------------------------

describe("Monitor trigger and execution", () => {
  it("POST /api/v2/monitors/:monitorRid/trigger executes a monitor", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("trigger-mon"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: { triggerData: { changedProperty: "status" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("SUCCESS");
    expect(body.monitorRid).toBe(rid);
    expect(body.effectResults).toHaveLength(2);
    expect(body.effectResults[0].status).toBe("SUCCESS");
  });

  it("GET /api/v2/monitors/:monitorRid/executions lists executions", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("exec-mon"),
    });
    const rid = createRes.json().rid;

    // Trigger twice
    await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });
    await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/monitors/${rid}/executions`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("trigger updates lastTriggeredAt on the monitor", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: makeMonitor("ts-mon"),
    });
    const rid = createRes.json().rid;

    // Before trigger
    const beforeRes = await app.inject({
      method: "GET",
      url: `/api/v2/monitors/${rid}`,
    });
    expect(beforeRes.json().lastTriggeredAt).toBeUndefined();

    // Trigger
    await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });

    // After trigger
    const afterRes = await app.inject({
      method: "GET",
      url: `/api/v2/monitors/${rid}`,
    });
    expect(afterRes.json().lastTriggeredAt).toBeDefined();
  });
});

// -------------------------------------------------------------------------
// Real effect execution: LOG effect
// -------------------------------------------------------------------------

describe("LOG effect execution", () => {
  it("LOG effect writes structured log and returns SUCCESS", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: {
        name: "log-test",
        objectType: "Employee",
        trigger: { type: "OBJECT_CHANGED", config: { properties: ["name"] } },
        effects: [{ type: "LOG", config: { message: "Test log entry", level: "info" } }],
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: { triggerData: { key: "value" } },
    });
    const body = res.json();
    expect(body.status).toBe("SUCCESS");
    expect(body.effectResults).toHaveLength(1);
    expect(body.effectResults[0].effectType).toBe("LOG");
    expect(body.effectResults[0].status).toBe("SUCCESS");
    expect(body.effectResults[0].detail).toContain("Test log entry");
  });
});

// -------------------------------------------------------------------------
// Real effect execution: NOTIFICATION effect
// -------------------------------------------------------------------------

describe("NOTIFICATION effect execution", () => {
  it("stores notification on trigger and exposes via API", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: {
        name: "notif-test",
        objectType: "Employee",
        trigger: { type: "OBJECT_CHANGED", config: { properties: ["status"] } },
        effects: [
          { type: "NOTIFICATION", config: { message: "Something changed", severity: "WARN" } },
        ],
      },
    });
    const rid = createRes.json().rid;

    // Trigger monitor to create a notification
    const triggerRes = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });
    expect(triggerRes.json().effectResults[0].effectType).toBe("NOTIFICATION");
    expect(triggerRes.json().effectResults[0].status).toBe("SUCCESS");

    // List notifications
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v2/notifications",
    });
    expect(listRes.statusCode).toBe(200);
    const notifications = listRes.json().data;
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe("Something changed");
    expect(notifications[0].severity).toBe("WARN");
    expect(notifications[0].monitorRid).toBe(rid);
    expect(notifications[0].read).toBe(false);

    // Mark as read
    const notifRid = notifications[0].rid;
    const readRes = await app.inject({
      method: "PUT",
      url: `/api/v2/notifications/${notifRid}/read`,
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().read).toBe(true);
  });
});

// -------------------------------------------------------------------------
// Real effect execution: WEBHOOK effect (mocked fetch)
// -------------------------------------------------------------------------

describe("WEBHOOK effect execution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers webhook successfully on 200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: {
        name: "webhook-test",
        objectType: "Employee",
        trigger: { type: "OBJECT_CHANGED", config: { properties: ["salary"] } },
        effects: [
          {
            type: "WEBHOOK",
            config: { url: "https://example.com/hook", secret: "test-secret" },
          },
        ],
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: { triggerData: { salary: 100000 } },
    });
    const body = res.json();
    expect(body.status).toBe("SUCCESS");
    expect(body.effectResults[0].effectType).toBe("WEBHOOK");
    expect(body.effectResults[0].status).toBe("SUCCESS");
    expect(body.effectResults[0].detail).toContain("HTTP 200");

    // Verify fetch was called with correct args
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(opts?.method).toBe("POST");
    const headers = opts?.headers as Record<string, string>;
    expect(headers["X-OpenFoundry-Signature"]).toMatch(/^sha256=[a-f0-9]+$/);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("reports FAILURE on non-retryable 4xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: {
        name: "webhook-fail-test",
        objectType: "Employee",
        trigger: { type: "OBJECT_CHANGED", config: { properties: ["status"] } },
        effects: [
          { type: "WEBHOOK", config: { url: "https://example.com/missing" } },
        ],
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });
    const body = res.json();
    expect(body.status).toBe("SUCCESS"); // execution itself succeeds, individual effect failed
    expect(body.effectResults[0].status).toBe("FAILURE");
    expect(body.effectResults[0].detail).toContain("404");

    // Should NOT retry on 4xx (only one call)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and eventually fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: {
        name: "webhook-retry-test",
        objectType: "Employee",
        trigger: { type: "OBJECT_CHANGED", config: { properties: ["status"] } },
        effects: [
          {
            type: "WEBHOOK",
            config: { url: "https://example.com/broken", timeoutMs: 1000 },
          },
        ],
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });
    const body = res.json();
    expect(body.effectResults[0].status).toBe("FAILURE");
    expect(body.effectResults[0].detail).toContain("500");

    // Should retry: 1 initial + 2 retries = 3 calls total
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});

// -------------------------------------------------------------------------
// Real effect execution: ACTION effect (mocked fetch)
// -------------------------------------------------------------------------

describe("ACTION effect execution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls actions service and returns SUCCESS", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }),
    );

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: {
        name: "action-test",
        objectType: "Employee",
        trigger: { type: "OBJECT_CHANGED", config: { properties: ["status"] } },
        effects: [
          {
            type: "ACTION",
            config: {
              actionsServiceUrl: "http://localhost:8085",
              actionApiName: "promoteEmployee",
              parameters: { employeeId: "123" },
              ontologyRid: "ri.ontology.main.ontology.test",
            },
          },
        ],
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });
    const body = res.json();
    expect(body.effectResults[0].effectType).toBe("ACTION");
    expect(body.effectResults[0].status).toBe("SUCCESS");
    expect(body.effectResults[0].detail).toContain("promoteEmployee");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8085/api/v2/actions/execute");
    const reqBody = JSON.parse(opts?.body as string);
    expect(reqBody.actionApiName).toBe("promoteEmployee");
    expect(reqBody.parameters.employeeId).toBe("123");
  });

  it("reports FAILURE when actions service returns error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Bad Request", { status: 400 }),
    );

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/monitors",
      payload: {
        name: "action-fail-test",
        objectType: "Employee",
        trigger: { type: "OBJECT_CHANGED", config: { properties: ["status"] } },
        effects: [
          {
            type: "ACTION",
            config: {
              actionsServiceUrl: "http://localhost:8085",
              actionApiName: "badAction",
            },
          },
        ],
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/monitors/${rid}/trigger`,
      payload: {},
    });
    const body = res.json();
    expect(body.effectResults[0].effectType).toBe("ACTION");
    expect(body.effectResults[0].status).toBe("FAILURE");
    expect(body.effectResults[0].detail).toContain("400");
  });
});
