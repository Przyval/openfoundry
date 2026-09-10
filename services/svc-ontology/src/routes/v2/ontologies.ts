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
    const raw = await store.listOntologies();
    const list: StoredOntology[] = Array.isArray(raw) ? raw : (raw as { items: StoredOntology[] }).items ?? raw as unknown as StoredOntology[];
    const all = list.map(serializeOntology);
    return paginateArray(all, request.query);
  });

  // Create ontology
  app.post<{
    Body: { apiName: string; displayName: string; description: string };
  }>("/ontologies", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const ontology = await store.createOntology(request.body);
    reply.status(201);
    return serializeOntology(ontology);
  });

  // Get ontology by RID or apiName
  app.get<{
    Params: { ontologyRid: string };
  }>("/ontologies/:ontologyRid", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const param = request.params.ontologyRid;

    // If it doesn't look like a RID, search by apiName
    if (!param.startsWith("ri.")) {
      const rawList = await store.listOntologies();
      const list: StoredOntology[] = Array.isArray(rawList) ? rawList : (rawList as { items: StoredOntology[] }).items ?? rawList as unknown as StoredOntology[];
      const match = list.find((o) => o.apiName === param);
      if (match) return serializeOntology(match);
    }

    const ontology = await store.getOntology(param);
    return serializeOntology(ontology);
  });

  // Full metadata — returns ontology with all type collections
  app.get<{
    Params: { ontologyRid: string };
  }>("/ontologies/:ontologyRid/fullMetadata", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const rid = request.params.ontologyRid;
    const [ontology, objectTypes, actionTypes, linkTypes, interfaceTypes] = await Promise.all([
      store.getOntology(rid),
      Promise.resolve(store.listObjectTypes(rid)),
      Promise.resolve(store.listActionTypes(rid)),
      Promise.resolve(store.listLinkTypes(rid)),
      Promise.resolve(store.listInterfaceTypes(rid)),
    ]);
    return {
      ...serializeOntology(ontology),
      objectTypes,
      actionTypes,
      linkTypes,
      interfaceTypes,
    };
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
