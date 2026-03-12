import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../proxy.js";

/**
 * Multipass (auth) routes — proxied to svc-multipass.
 *
 * Mounted at `/multipass` so requests like `/multipass/api/oauth2/token`
 * are forwarded to the multipass service.
 */
export async function multipassRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.multipass);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.multipass);
  });
}
