import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Functions routes — proxied to svc-functions.
 */
export async function functionRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.functions);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.functions);
  });
}
