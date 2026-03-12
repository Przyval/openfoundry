import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Notification routes — proxied to svc-sentinel.
 */
export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.sentinel);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.sentinel);
  });
}
