import type { FastifyInstance } from "fastify";
import type { WebhookStore, WebhookEvent } from "../../store/webhook-store.js";
import type { DeliveryLog } from "../../store/delivery-log.js";
import { deliverWebhook } from "../../delivery.js";

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

function paginate<T>(items: T[], query: { pageSize?: string; pageToken?: string }) {
  const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? "100", 10) || 100, 1), 1000);
  const offset = query.pageToken ? parseInt(query.pageToken, 10) || 0 : 0;
  const slice = items.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  return {
    data: slice,
    ...(nextOffset < items.length ? { nextPageToken: String(nextOffset) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function webhookRoutes(
  app: FastifyInstance,
  opts: { webhookStore: WebhookStore; deliveryLog: DeliveryLog },
): Promise<void> {
  const { webhookStore, deliveryLog } = opts;

  // List webhooks
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/webhooks", async (request) => {
    const all = webhookStore.listWebhooks();
    return paginate(all, request.query);
  });

  // Create webhook
  app.post<{
    Body: {
      name: string;
      url: string;
      secret?: string;
      events: WebhookEvent[];
    };
  }>("/webhooks", async (request, reply) => {
    const webhook = webhookStore.createWebhook(request.body);
    reply.status(201);
    return webhook;
  });

  // Get webhook
  app.get<{
    Params: { webhookRid: string };
  }>("/webhooks/:webhookRid", async (request) => {
    return webhookStore.getWebhook(request.params.webhookRid);
  });

  // Update webhook
  app.put<{
    Params: { webhookRid: string };
    Body: {
      name?: string;
      url?: string;
      secret?: string;
      events?: WebhookEvent[];
      status?: "ACTIVE" | "PAUSED" | "FAILED";
    };
  }>("/webhooks/:webhookRid", async (request) => {
    return webhookStore.updateWebhook(request.params.webhookRid, request.body);
  });

  // Delete webhook
  app.delete<{
    Params: { webhookRid: string };
  }>("/webhooks/:webhookRid", async (request, reply) => {
    webhookStore.deleteWebhook(request.params.webhookRid);
    reply.status(204);
    return;
  });

  // List deliveries for a webhook
  app.get<{
    Params: { webhookRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/webhooks/:webhookRid/deliveries", async (request) => {
    // Verify webhook exists
    webhookStore.getWebhook(request.params.webhookRid);
    const deliveries = deliveryLog.listDeliveries(request.params.webhookRid);
    return paginate(deliveries, request.query);
  });

  // Send test event to a webhook
  app.post<{
    Params: { webhookRid: string };
  }>("/webhooks/test/:webhookRid", async (request) => {
    const webhook = webhookStore.getWebhook(request.params.webhookRid);
    const testPayload = {
      type: "webhook.test",
      timestamp: new Date().toISOString(),
      data: { message: "This is a test event" },
    };
    const delivery = await deliverWebhook(
      webhook,
      "webhook.test",
      testPayload,
      deliveryLog,
      webhookStore,
    );
    return delivery;
  });
}
