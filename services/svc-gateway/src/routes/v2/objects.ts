import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Object routes — proxied to svc-objects.
 */
export async function objectRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.objects);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.objects);
  });
}
