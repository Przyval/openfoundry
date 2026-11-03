import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/** A custom JDBC driver is a jar, uploaded as the raw body of the request. */
const DRIVER_UPLOAD_LIMIT = 64 * 1024 * 1024;

/**
 * Connectivity routes (the Foundry `connectivity` section) - proxied to
 * svc-datasets, which serves Connections, File and Table Imports and Virtual
 * Tables.
 */
export async function connectivityRoutes(app: FastifyInstance): Promise<void> {
  // Keep an `application/octet-stream` body as bytes, so the proxy can forward
  // it untouched instead of Fastify refusing the media type.
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: DRIVER_UPLOAD_LIMIT },
    (_request, body, done) => done(null, body),
  );

  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });

  app.all("/*", { bodyLimit: DRIVER_UPLOAD_LIMIT }, async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.datasets);
  });
}
