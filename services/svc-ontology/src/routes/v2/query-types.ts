import type { FastifyInstance } from "fastify";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";

export async function queryTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  // List query types (returns empty list when none are registered)
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/queryTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async () => {
    return { data: [] };
  });
}
