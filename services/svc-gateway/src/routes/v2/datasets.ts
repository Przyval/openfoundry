import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Dataset routes — proxied to svc-datasets.
 */
export async function datasetRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });
}
