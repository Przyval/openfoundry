import type { FastifyInstance } from "fastify";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { rejectUnsupportedOntologyScoping } from "@openfoundry/errors";

export async function queryTypeRoutes(
  app: FastifyInstance,
  _opts: { store: OntologyStore },
): Promise<void> {
  // List query types (returns empty list when none are registered)
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string; branch?: string };
  }>("/ontologies/:ontologyRid/queryTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    rejectUnsupportedOntologyScoping(request.query);
    return { data: [] };
  });
}
