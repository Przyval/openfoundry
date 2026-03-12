import type { FastifyInstance } from "fastify";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Fastify plugin that ensures every response includes the X-Request-Id header.
 *
 * Fastify already generates a request ID (via `genReqId` and `requestIdHeader`
 * in the server config). This plugin copies it onto the outgoing response so
 * that clients and load balancers can correlate requests.
 */
export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onSend", async (request, reply) => {
    if (!reply.hasHeader(REQUEST_ID_HEADER)) {
      reply.header(REQUEST_ID_HEADER, request.id);
    }
  });
}
