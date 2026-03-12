import type { FastifyInstance } from "fastify";
import type { OntologyStore, SharedPropertyType } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

export async function sharedPropertyTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List shared property types
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/sharedPropertyTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const all = store.listSharedPropertyTypes(request.params.ontologyRid);
    return paginateArray(all, request.query);
  });

  // Create shared property type
  app.post<{
    Params: { ontologyRid: string };
    Body: SharedPropertyType;
  }>("/ontologies/:ontologyRid/sharedPropertyTypes", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const spt = store.createSharedPropertyType(
      request.params.ontologyRid,
      request.body,
    );
    reply.status(201);
    return spt;
  });

  // Get shared property type by apiName
  app.get<{
    Params: { ontologyRid: string; apiName: string };
  }>(
    "/ontologies/:ontologyRid/sharedPropertyTypes/:apiName",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      return store.getSharedPropertyType(
        request.params.ontologyRid,
        request.params.apiName,
      );
    },
  );

  // Delete shared property type
  app.delete<{
    Params: { ontologyRid: string; apiName: string };
  }>(
    "/ontologies/:ontologyRid/sharedPropertyTypes/:apiName",
    {
      preHandler: requirePermission("ontology:delete"),
    },
    async (request, reply) => {
      store.deleteSharedPropertyType(
        request.params.ontologyRid,
        request.params.apiName,
      );
      reply.status(204);
      return;
    },
  );
}
