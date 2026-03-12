import type { FastifyInstance } from "fastify";
import type { WebhookStore, WebhookEvent } from "../../store/webhook-store.js";
import type { DeliveryLog } from "../../store/delivery-log.js";
import { deliverWebhook } from "../../delivery.js";

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function eventRoutes(
  app: FastifyInstance,
  opts: { webhookStore: WebhookStore; deliveryLog: DeliveryLog },
): Promise<void> {
  const { webhookStore, deliveryLog } = opts;

  // Publish event (internal API, triggers webhook delivery)
  app.post<{
    Body: {
      event: WebhookEvent;
      payload: unknown;
    };
  }>("/events", async (request, reply) => {
    const { event, payload } = request.body;

    // Find all active webhooks subscribed to this event
    const webhooks = webhookStore.getWebhooksForEvent(event);

    // Deliver to all matching webhooks in parallel
    const deliveries = await Promise.allSettled(
      webhooks.map((wh) =>
        deliverWebhook(wh, event, payload, deliveryLog, webhookStore),
      ),
    );

    const results = deliveries.map((d, i) => ({
      webhookRid: webhooks[i].rid,
      status: d.status === "fulfilled" ? d.value.status : "FAILED",
      deliveryRid: d.status === "fulfilled" ? d.value.rid : undefined,
    }));

    reply.status(202);
    return {
      event,
      webhooksNotified: webhooks.length,
      results,
    };
  });
}
