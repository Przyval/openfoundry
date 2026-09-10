import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/** Dataset v1 routes — proxied to svc-datasets. */
export async function datasetRoutesV1(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });
}
