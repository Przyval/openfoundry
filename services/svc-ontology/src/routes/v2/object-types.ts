import type { FastifyInstance } from "fastify";
import type { ObjectTypeDefinition } from "@openfoundry/ontology-schema";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

export async function objectTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List object types
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/objectTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const raw = await store.listObjectTypes(request.params.ontologyRid);
    const all = Array.isArray(raw) ? raw : (raw as { items: unknown[] }).items ?? [];
    return paginateArray(all, request.query);
  });

  // Create object type
  app.post<{
    Params: { ontologyRid: string };
    Body: ObjectTypeDefinition;
  }>("/ontologies/:ontologyRid/objectTypes", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const objectType = await store.createObjectType(
      request.params.ontologyRid,
      request.body,
    );
    reply.status(201);
    return objectType;
  });

  // Get object type by apiName
  app.get<{
    Params: { ontologyRid: string; objectTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/objectTypes/:objectTypeApiName",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      return await store.getObjectType(
        request.params.ontologyRid,
        request.params.objectTypeApiName,
      );
    },
  );

  // Update object type
  app.put<{
    Params: { ontologyRid: string; objectTypeApiName: string };
    Body: ObjectTypeDefinition;
  }>(
    "/ontologies/:ontologyRid/objectTypes/:objectTypeApiName",
    {
      preHandler: requirePermission("ontology:write"),
    },
    async (request) => {
      return await store.updateObjectType(
        request.params.ontologyRid,
        request.params.objectTypeApiName,
        request.body,
      );
    },
  );

  // Delete object type
  app.delete<{
    Params: { ontologyRid: string; objectTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/objectTypes/:objectTypeApiName",
    {
      preHandler: requirePermission("ontology:delete"),
    },
    async (request, reply) => {
      store.deleteObjectType(
        request.params.ontologyRid,
        request.params.objectTypeApiName,
      );
      reply.status(204);
      return;
    },
  );
}
