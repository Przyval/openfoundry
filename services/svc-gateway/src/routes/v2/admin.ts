import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Admin routes — proxied to svc-admin.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.admin);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.admin);
  });
}
