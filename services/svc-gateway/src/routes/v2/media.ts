import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Media routes — proxied to svc-media.
 */
export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.media);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.media);
  });
}
