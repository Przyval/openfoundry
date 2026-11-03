import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Connectivity routes (the Foundry `connectivity` section) - proxied to
 * svc-datasets, which serves Connections, File and Table Imports and Virtual
 * Tables.
 */
export async function connectivityRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });
}
