import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * AIP routes — proxied to svc-aip.
 */
export async function aipRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.aip);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.aip);
  });
}
