import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Admin routes — proxied to svc-admin, except users/getCurrent which goes to svc-multipass.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // users/getCurrent is served by svc-multipass (it decodes the Bearer token)
  app.all("/users/getCurrent", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.multipass);
  });

  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.admin);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.admin);
  });
}
