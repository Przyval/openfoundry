import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Ontology v1 API routes.
 *
 * The same three-way split as v2 — objects to svc-objects, action apply and
 * validate to svc-actions, metadata to svc-ontology — but `applyBatch` is
 * matched here as well. The v2 route's pattern anchors on `/(apply|validate)$`,
 * which `/applyBatch` does not end with, so v2's batch apply is forwarded to
 * svc-ontology, where no such route exists. That is a defect in the v2 proxy and
 * is left alone; v1 simply does not repeat it.
 */
export async function ontologyRoutesV1(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.ontology);
  });

  app.all("/*", async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url;

    // /ontologies/{rid}/objects/... -> svc-objects
    //   Covers: list objects, get by primary key, search, aggregate, links.
    if (/\/ontologies\/[^/]+\/objects(\/|$)/.test(url)) {
      return proxyRequest(request, reply, app.config.services.objects);
    }

    // /ontologies/{rid}/actions/{action}/{apply,applyBatch,validate} -> svc-actions
    if (/\/ontologies\/[^/]+\/actions\/[^/]+\/(apply|applyBatch|validate)(\?|$)/.test(url)) {
      return proxyRequest(request, reply, app.config.services.actions);
    }

    // Everything else -> svc-ontology
    //   Covers: get ontology, objectTypes, outgoingLinkTypes, actionTypes,
    //   queryTypes.
    return proxyRequest(request, reply, app.config.services.ontology);
  });
}
