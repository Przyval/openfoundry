import type { FastifyInstance } from "fastify";
import type { LinkTypeDefinition } from "@openfoundry/ontology-schema";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

export async function linkTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List link types for a specific object type
  app.get<{
    Params: { ontologyRid: string; objectTypeApiName: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>(
    "/ontologies/:ontologyRid/objectTypes/:objectTypeApiName/linkTypes",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      const all = store.listLinkTypesForObjectType(
        request.params.ontologyRid,
        request.params.objectTypeApiName,
      );
      return paginateArray(all, request.query);
    },
  );

  // Create link type
  app.post<{
    Params: { ontologyRid: string };
    Body: LinkTypeDefinition;
  }>("/ontologies/:ontologyRid/linkTypes", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const linkType = store.createLinkType(
      request.params.ontologyRid,
      request.body,
    );
    reply.status(201);
    return linkType;
  });

  // Get link type by apiName
  app.get<{
    Params: { ontologyRid: string; linkTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/linkTypes/:linkTypeApiName",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      return store.getLinkType(
        request.params.ontologyRid,
        request.params.linkTypeApiName,
      );
    },
  );

  // Delete link type
  app.delete<{
    Params: { ontologyRid: string; linkTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/linkTypes/:linkTypeApiName",
    {
      preHandler: requirePermission("ontology:delete"),
    },
    async (request, reply) => {
      store.deleteLinkType(
        request.params.ontologyRid,
        request.params.linkTypeApiName,
      );
      reply.status(204);
      return;
    },
  );
}
