import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../proxy.js";

/**
 * Multipass (auth) routes — proxied to svc-multipass.
 *
 * Mounted at `/multipass` so requests like `/multipass/api/oauth2/token`
 * are forwarded to the multipass service.
 *
 * Handles both JSON and form-urlencoded bodies (oauth2/token typically
 * sends `application/x-www-form-urlencoded`).
 */
export async function multipassRoutes(app: FastifyInstance): Promise<void> {
  // Register a content-type parser for form-urlencoded bodies so that
  // Fastify does not reject POST /multipass/api/oauth2/token requests.
  // We keep the raw string so the proxy can forward it unchanged.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.multipass);
  });

  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.multipass);
  });
}
