import type { FastifyInstance } from "fastify";
import type { OntologyStore, StoredOntology } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

/** Serialize a StoredOntology to the wire format. */
function serializeOntology(ont: StoredOntology) {
  return {
    rid: ont.rid,
    apiName: ont.apiName,
    displayName: ont.displayName,
    description: ont.description,
    version: ont.version,
  };
}

export async function ontologyRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List ontologies
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const all = store.listOntologies().map(serializeOntology);
    return paginateArray(all, request.query);
  });

  // Create ontology
  app.post<{
    Body: { apiName: string; displayName: string; description: string };
  }>("/ontologies", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const ontology = store.createOntology(request.body);
    reply.status(201);
    return serializeOntology(ontology);
  });

  // Get ontology by RID
  app.get<{
    Params: { ontologyRid: string };
  }>("/ontologies/:ontologyRid", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const ontology = store.getOntology(request.params.ontologyRid);
    return serializeOntology(ontology);
  });

  // Delete ontology
  app.delete<{
    Params: { ontologyRid: string };
  }>("/ontologies/:ontologyRid", {
    preHandler: requirePermission("ontology:delete"),
  }, async (request, reply) => {
    store.deleteOntology(request.params.ontologyRid);
    reply.status(204);
    return;
  });
}
