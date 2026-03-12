import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("Sentinel monitors: create, list, enable/disable, trigger, delete", () => {
  let sentinelApp: FastifyInstance;
  let objectChangedRid: string;
  let thresholdRid: string;

  beforeAll(async () => {
    const { createServer: createSentinelServer } = await import(
      "../../services/svc-sentinel/src/server.js"
    );
    sentinelApp = await createSentinelServer();
  });

  afterAll(async () => {
    await sentinelApp?.close();
  });

  it("creates a monitor with OBJECT_CHANGED trigger", async () => {
    const res = await sentinelApp.inject({
      method: "POST",
      url: "/api/v2/monitors",
      headers: { "content-type": "application/json" },
      payload: {
        name: "Employee Change Monitor",
        description: "Fires when an Employee object changes",
        objectType: "Employee",
        trigger: {
          type: "OBJECT_CHANGED",
          config: { objectType: "Employee" },
        },
        effects: [
          { type: "WEBHOOK", config: { url: "https://example.com/hook" } },
          { type: "LOG", config: { message: "Employee changed" } },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rid).toBeDefined();
    expect(body.name).toBe("Employee Change Monitor");
    expect(body.status).toBe("ACTIVE");
    objectChangedRid = body.rid;
  });

  it("creates a monitor with PROPERTY_THRESHOLD trigger", async () => {
    const res = await sentinelApp.inject({
      method: "POST",
      url: "/api/v2/monitors",
      headers: { "content-type": "application/json" },
      payload: {
        name: "High Budget Alert",
        description: "Fires when department budget exceeds threshold",
        objectType: "Department",
        trigger: {
          type: "PROPERTY_THRESHOLD",
          config: { property: "budget", operator: "GREATER_THAN", value: 1000000 },
        },
        effects: [
          { type: "LOG", config: { message: "Budget exceeded threshold" } },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rid).toBeDefined();
    expect(body.name).toBe("High Budget Alert");
    thresholdRid = body.rid;
  });

  it("lists all monitors", async () => {
    const res = await sentinelApp.inject({
      method: "GET",
      url: "/api/v2/monitors",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(2);
    const names = body.data.map((m: { name: string }) => m.name).sort();
    expect(names).toEqual([
      "Employee Change Monitor",
      "High Budget Alert",
    ]);
  });

  it("pauses and reactivates a monitor", async () => {
    // Pause the monitor
    const pauseRes = await sentinelApp.inject({
      method: "PUT",
      url: `/api/v2/monitors/${objectChangedRid}`,
      headers: { "content-type": "application/json" },
      payload: { status: "PAUSED" },
    });
    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.json().status).toBe("PAUSED");

    // Verify via GET
    const getRes = await sentinelApp.inject({
      method: "GET",
      url: `/api/v2/monitors/${objectChangedRid}`,
    });
    expect(getRes.json().status).toBe("PAUSED");

    // Reactivate
    const activateRes = await sentinelApp.inject({
      method: "PUT",
      url: `/api/v2/monitors/${objectChangedRid}`,
      headers: { "content-type": "application/json" },
      payload: { status: "ACTIVE" },
    });
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().status).toBe("ACTIVE");
  });

  it("manually triggers a monitor and records execution", async () => {
    const triggerRes = await sentinelApp.inject({
      method: "POST",
      url: `/api/v2/monitors/${thresholdRid}/trigger`,
      headers: { "content-type": "application/json" },
      payload: { triggerData: { budget: 1500000 } },
    });
    expect(triggerRes.statusCode).toBe(200);
    const body = triggerRes.json();
    expect(body.rid).toBeDefined();
    expect(body.status).toBe("SUCCESS");

    // Verify execution log
    const execRes = await sentinelApp.inject({
      method: "GET",
      url: `/api/v2/monitors/${thresholdRid}/executions`,
    });
    expect(execRes.statusCode).toBe(200);
    expect(execRes.json().data.length).toBeGreaterThanOrEqual(1);
  });

  it("deletes monitors", async () => {
    const del1 = await sentinelApp.inject({
      method: "DELETE",
      url: `/api/v2/monitors/${objectChangedRid}`,
    });
    expect(del1.statusCode).toBe(204);

    const del2 = await sentinelApp.inject({
      method: "DELETE",
      url: `/api/v2/monitors/${thresholdRid}`,
    });
    expect(del2.statusCode).toBe(204);

    // Verify all monitors are gone
    const listRes = await sentinelApp.inject({
      method: "GET",
      url: "/api/v2/monitors",
    });
    expect(listRes.json().data.length).toBe(0);
  });
});
