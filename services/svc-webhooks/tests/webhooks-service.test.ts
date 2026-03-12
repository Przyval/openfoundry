import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { WebhookStore } from "../src/store/webhook-store.js";
import { DeliveryLog } from "../src/store/delivery-log.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

function makeWebhook(name: string) {
  return {
    name,
    url: `https://example.com/hooks/${name}`,
    secret: "test-secret-123",
    events: ["object.created", "object.updated"] as const,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let webhookStore: WebhookStore;
let deliveryLog: DeliveryLog;

beforeEach(async () => {
  webhookStore = new WebhookStore();
  deliveryLog = new DeliveryLog();
  app = await createServer({ config: TEST_CONFIG, webhookStore, deliveryLog });
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
// Webhook CRUD
// -------------------------------------------------------------------------

describe("Webhook CRUD", () => {
  it("POST /api/v2/webhooks creates a webhook", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("my-hook"),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("my-hook");
    expect(body.rid).toMatch(/^ri\./);
    expect(body.status).toBe("ACTIVE");
    expect(body.failureCount).toBe(0);
  });

  it("GET /api/v2/webhooks lists webhooks", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("hook-a"),
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("hook-b"),
    });

    const res = await app.inject({ method: "GET", url: "/api/v2/webhooks" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET /api/v2/webhooks/:webhookRid returns a webhook", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("get-hook"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/webhooks/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("get-hook");
  });

  it("GET /api/v2/webhooks/:webhookRid returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/webhooks/ri.webhooks.main.webhook.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /api/v2/webhooks/:webhookRid updates a webhook", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("update-hook"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/webhooks/${rid}`,
      payload: { name: "renamed-hook", status: "PAUSED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("renamed-hook");
    expect(res.json().status).toBe("PAUSED");
  });

  it("DELETE /api/v2/webhooks/:webhookRid deletes a webhook", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("delete-hook"),
    });
    const rid = createRes.json().rid;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/webhooks/${rid}`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/webhooks/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("POST /api/v2/webhooks returns 409 for duplicate name", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("dup-hook"),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("dup-hook"),
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Deliveries
// -------------------------------------------------------------------------

describe("Deliveries", () => {
  it("GET /api/v2/webhooks/:webhookRid/deliveries lists deliveries (empty)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("delivery-hook"),
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/webhooks/${rid}/deliveries`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });

  it("GET /api/v2/webhooks/:webhookRid/deliveries returns 404 for unknown webhook", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/webhooks/ri.webhooks.main.webhook.nope/deliveries",
    });
    expect(res.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Events
// -------------------------------------------------------------------------

describe("Events", () => {
  it("POST /api/v2/events publishes an event with no subscribers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        event: "object.created",
        payload: { objectRid: "ri.test.main.object.123" },
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.event).toBe("object.created");
    expect(body.webhooksNotified).toBe(0);
    expect(body.results).toHaveLength(0);
  });

  it("POST /api/v2/events notifies matching webhooks", async () => {
    // Create a webhook subscribed to object.created
    await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("event-hook"),
    });

    // Publish event (delivery will fail because URL is not reachable, but the
    // endpoint should still return 202 with results)
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        event: "object.created",
        payload: { objectRid: "ri.test.main.object.456" },
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.webhooksNotified).toBe(1);
    expect(body.results).toHaveLength(1);
  });

  it("POST /api/v2/events does not notify paused webhooks", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: makeWebhook("paused-hook"),
    });
    const rid = createRes.json().rid;

    // Pause the webhook
    await app.inject({
      method: "PUT",
      url: `/api/v2/webhooks/${rid}`,
      payload: { status: "PAUSED" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        event: "object.created",
        payload: { data: "test" },
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().webhooksNotified).toBe(0);
  });

  it("POST /api/v2/events only notifies webhooks subscribed to the event", async () => {
    // Create a webhook subscribed only to ontology.modified
    await app.inject({
      method: "POST",
      url: "/api/v2/webhooks",
      payload: {
        name: "ontology-only",
        url: "https://example.com/hooks/ontology",
        events: ["ontology.modified"],
      },
    });

    // Publish object.created — should not match
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/events",
      payload: {
        event: "object.created",
        payload: { data: "test" },
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().webhooksNotified).toBe(0);
  });
});

// -------------------------------------------------------------------------
// Webhook store internals
// -------------------------------------------------------------------------

describe("WebhookStore", () => {
  it("getWebhooksForEvent filters by event and active status", () => {
    const wh = webhookStore.createWebhook({
      name: "active-hook",
      url: "https://example.com",
      events: ["object.created", "object.deleted"],
    });

    const matches = webhookStore.getWebhooksForEvent("object.created");
    expect(matches).toHaveLength(1);
    expect(matches[0].rid).toBe(wh.rid);

    const noMatches = webhookStore.getWebhooksForEvent("action.executed");
    expect(noMatches).toHaveLength(0);
  });
});
