import type { FastifyInstance } from "fastify";
import type { InterfaceTypeDefinition } from "@openfoundry/ontology-schema";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

export async function interfaceTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List interface types
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/interfaceTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const all = store.listInterfaceTypes(request.params.ontologyRid);
    return paginateArray(all, request.query);
  });

  // Create interface type
  app.post<{
    Params: { ontologyRid: string };
    Body: InterfaceTypeDefinition;
  }>("/ontologies/:ontologyRid/interfaceTypes", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const interfaceType = store.createInterfaceType(
      request.params.ontologyRid,
      request.body,
    );
    reply.status(201);
    return interfaceType;
  });

  // Get interface type by apiName
  app.get<{
    Params: { ontologyRid: string; interfaceTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/interfaceTypes/:interfaceTypeApiName",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      return store.getInterfaceType(
        request.params.ontologyRid,
        request.params.interfaceTypeApiName,
      );
    },
  );

  // Delete interface type
  app.delete<{
    Params: { ontologyRid: string; interfaceTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/interfaceTypes/:interfaceTypeApiName",
    {
      preHandler: requirePermission("ontology:delete"),
    },
    async (request, reply) => {
      store.deleteInterfaceType(
        request.params.ontologyRid,
        request.params.interfaceTypeApiName,
      );
      reply.status(204);
      return;
    },
  );
}
