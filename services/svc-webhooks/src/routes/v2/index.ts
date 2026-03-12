import type { FastifyInstance } from "fastify";
import type { WebhookStore } from "../../store/webhook-store.js";
import type { DeliveryLog } from "../../store/delivery-log.js";
import { webhookRoutes } from "./webhooks.js";
import { eventRoutes } from "./events.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: { webhookStore: WebhookStore; deliveryLog: DeliveryLog },
): Promise<void> {
  const routeOpts = { webhookStore: opts.webhookStore, deliveryLog: opts.deliveryLog };

  await app.register(webhookRoutes, routeOpts);
  await app.register(eventRoutes, routeOpts);
}
