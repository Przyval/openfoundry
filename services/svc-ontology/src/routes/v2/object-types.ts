import type { FastifyInstance } from "fastify";
import type { ObjectTypeDefinition } from "@openfoundry/ontology-schema";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { rejectUnsupportedOntologyScoping } from "@openfoundry/errors";
import { paginateArray } from "./pagination-helpers.js";
import { parseBooleanParam } from "./query-params.js";

/**
 * Populates the `datasources` field the caller opted into with
 * `includeDatasources=true`.
 *
 * Foundry only emits this field when the flag is set, and documents the list as
 * possibly empty when the caller can see no backing datasource. OpenFoundry
 * object types are served straight from the object store rather than from a
 * backing dataset, so the list is always empty here — but its presence still
 * tracks the flag exactly, which is the part of the contract a client can act on.
 */
function withDatasources<T>(
  objectType: T,
  includeDatasources: boolean | undefined,
): T | (T & { datasources: never[] }) {
  if (includeDatasources !== true) return objectType;
  return { ...objectType, datasources: [] };
}

export async function objectTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List object types
  app.get<{
    Params: { ontologyRid: string };
    Querystring: {
      pageSize?: string;
      pageToken?: string;
      includeDatasources?: string;
      branch?: string;
    };
  }>("/ontologies/:ontologyRid/objectTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    rejectUnsupportedOntologyScoping(request.query);
    const includeDatasources = parseBooleanParam(
      "includeDatasources",
      request.query.includeDatasources,
    );
    const raw = await store.listObjectTypes(request.params.ontologyRid);
    const all = Array.isArray(raw) ? raw : (raw as { items: unknown[] }).items ?? [];
    const page = paginateArray(all, request.query);
    return {
      ...page,
      data: page.data.map((ot) => withDatasources(ot, includeDatasources)),
    };
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
    Querystring: { includeDatasources?: string; branch?: string };
  }>(
    "/ontologies/:ontologyRid/objectTypes/:objectTypeApiName",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      const includeDatasources = parseBooleanParam(
        "includeDatasources",
        request.query.includeDatasources,
      );
      const objectType = await store.getObjectType(
        request.params.ontologyRid,
        request.params.objectTypeApiName,
      );
      return withDatasources(objectType, includeDatasources);
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
