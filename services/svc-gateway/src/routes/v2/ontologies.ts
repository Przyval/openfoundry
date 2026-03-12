import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Ontology v2 API routes.
 *
 * Routes under /api/v2/ontologies are split based on URL pattern:
 * - .../objects/... and .../objectSets/... -> svc-objects
 * - .../actions/.../apply or validate -> svc-actions
 * - Everything else -> svc-ontology
 */
export async function ontologyRoutes(app: FastifyInstance): Promise<void> {
  // List/get ontologies (no RID)
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.ontology);
  });

  // Catch-all: inspect the URL to decide which service to proxy to
  app.all("/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url;

    // /ontologies/{rid}/objects/... -> svc-objects
    // /ontologies/{rid}/objectSets/... -> svc-objects
    if (/\/ontologies\/[^/]+\/objects(\/|$)/.test(url) ||
        /\/ontologies\/[^/]+\/objectSets(\/|$)/.test(url)) {
      return proxyRequest(request, reply, app.config.services.objects);
    }

    // /ontologies/{rid}/actions/{action}/apply or validate -> svc-actions
    if (/\/ontologies\/[^/]+\/actions\/[^/]+\/(apply|validate)$/.test(url)) {
      return proxyRequest(request, reply, app.config.services.actions);
    }

    // Everything else -> svc-ontology
    return proxyRequest(request, reply, app.config.services.ontology);
  });
}
