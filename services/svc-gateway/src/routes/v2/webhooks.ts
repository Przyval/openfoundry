import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Webhook routes — proxied to svc-webhooks.
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.webhooks);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.webhooks);
  });
}
