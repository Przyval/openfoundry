import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Auth routes — proxied to svc-multipass.
 *
 * Handles:
 * - POST /api/v2/auth/signup  — create new user + organization
 * - POST /api/v2/auth/token   — get access token
 * - GET  /api/v2/auth/me      — get current user info
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.all("/*", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.multipass);
  });
}
