import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Pipeline routes — proxied to svc-datasets (pipelines are managed by the
 * datasets service).
 */
export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });
}
