import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Compass routes — proxied to svc-compass.
 */
export async function compassRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.compass);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.compass);
  });
}
