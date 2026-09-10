import type { FastifyInstance } from "fastify";
import type { LinkTypeDefinition } from "@openfoundry/ontology-schema";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { rejectUnsupportedOntologyScoping } from "@openfoundry/errors";
import { paginateArray } from "./pagination-helpers.js";

/**
 * Project a link type onto Foundry's `LinkTypeSideV2`, as seen from
 * `objectTypeApiName`.
 *
 * A link side describes the *far* end of the link, so the emitted
 * `objectTypeApiName` is the linked object type, not the one being queried.
 */
function toLinkTypeSide(link: LinkTypeDefinition) {
  return {
    apiName: link.apiName,
    displayName: link.apiName,
    status: "ACTIVE",
    objectTypeApiName: link.linkedObjectTypeApiName,
    cardinality: link.cardinality,
    foreignKeyPropertyApiName: link.foreignKeyPropertyApiName,
  };
}

export async function linkTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List ALL link types for an ontology
  // GET /api/v2/ontologies/:ontologyRid/linkTypes
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>(
    "/ontologies/:ontologyRid/linkTypes",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      const raw = await store.listLinkTypes(request.params.ontologyRid);
    const all = Array.isArray(raw) ? raw : (raw as { items: unknown[] }).items ?? [];
      return paginateArray(all, request.query);
    },
  );

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
      const all = await store.listLinkTypesForObjectType(
        request.params.ontologyRid,
        request.params.objectTypeApiName,
      );
      return paginateArray(all, request.query);
    },
  );

  // List the outgoing link types of an object type.
  //
  // This is Foundry's `ontologies.ObjectType.listOutgoingLinkTypes`: only the
  // links where this object type is the source count as outgoing, and each is
  // returned as a `LinkTypeSideV2`.  The neighbouring `/linkTypes` route is
  // OpenFoundry's own, returns both directions, and is left as it is because
  // `@openfoundry/sdk` calls it.
  app.get<{
    Params: { ontologyRid: string; objectTypeApiName: string };
    Querystring: { branch?: string; pageSize?: string; pageToken?: string };
  }>(
    "/ontologies/:ontologyRid/objectTypes/:objectTypeApiName/outgoingLinkTypes",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      rejectUnsupportedOntologyScoping(request.query);
      const { ontologyRid, objectTypeApiName } = request.params;
      const all = await store.listLinkTypesForObjectType(
        ontologyRid,
        objectTypeApiName,
      );
      const outgoing = all
        .filter((link) => link.objectTypeApiName === objectTypeApiName)
        .map(toLinkTypeSide);
      return paginateArray(outgoing, request.query);
    },
  );

  // Create link type
  app.post<{
    Params: { ontologyRid: string };
    Body: LinkTypeDefinition;
  }>("/ontologies/:ontologyRid/linkTypes", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const linkType = await store.createLinkType(
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
      return await store.getLinkType(
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
