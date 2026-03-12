import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Action routes — proxied to svc-actions.
 */
export async function actionRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.actions);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.actions);
  });
}
