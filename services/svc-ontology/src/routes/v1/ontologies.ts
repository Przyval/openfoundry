import type { FastifyInstance } from "fastify";
import type {
  ActionTypeDefinition,
  LinkTypeDefinition,
  ObjectTypeDefinition,
} from "@openfoundry/ontology-schema";
import { requirePermission } from "@openfoundry/permissions";
import type { OntologyStore, StoredOntology } from "../../store/ontology-store.js";
// `pageSize` / `pageToken` mean the same thing in both API versions, so the
// helper is shared rather than duplicated under `v1/`.
import { paginateArray } from "../v2/pagination-helpers.js";
import {
  toV1ActionType,
  toV1LinkTypeSide,
  toV1ObjectType,
  toV1Ontology,
} from "./serializers.js";

/**
 * Both `OntologyStore` and `PgOntologyStore` back these routes, and the latter
 * answers a list as `{ items, total }` rather than an array. Normalised here for
 * the same reason the v2 routes do it: the paginator needs a plain array.
 */
function asArray<T>(raw: T[] | { items?: T[] }): T[] {
  return Array.isArray(raw) ? raw : (raw.items ?? []);
}

export async function ontologyRoutesV1(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  /**
   * v1 names this path parameter `ontologyRid`, but the same ontology is also
   * addressable by api name in v2 and the console links to both, so a non-RID
   * value is resolved by api name before the store is asked for a RID it would
   * never find.
   */
  const resolveOntology = async (param: string): Promise<StoredOntology> => {
    if (!param.startsWith("ri.")) {
      const match = asArray(await store.listOntologies()).find(
        (ontology) => ontology.apiName === param,
      );
      if (match) return match;
    }
    return await store.getOntology(param);
  };

  // -----------------------------------------------------------------------
  // Ontologies
  // -----------------------------------------------------------------------

  // List ontologies.
  //
  // `ListOntologiesResponse` has a `data` field and nothing else: v1 does not
  // paginate this operation, and it declares no `pageSize` or `pageToken`. The
  // v2 route does paginate, which is why this is not an alias.
  //
  // Against Postgres this is capped at `PgOntologyStore.listOntologies`'s
  // default page of 100, which the v1 response has no token to page past. That
  // is a store limit shared with the v2 route, not a choice made here.
  app.get("/ontologies", {
    preHandler: requirePermission("ontology:read"),
  }, async () => {
    return { data: asArray(await store.listOntologies()).map(toV1Ontology) };
  });

  // Get ontology
  app.get<{
    Params: { ontologyRid: string };
  }>("/ontologies/:ontologyRid", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    return toV1Ontology(await resolveOntology(request.params.ontologyRid));
  });

  // -----------------------------------------------------------------------
  // Object types
  // -----------------------------------------------------------------------

  // List object types
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/objectTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const { rid } = await resolveOntology(request.params.ontologyRid);
    const objectTypes = asArray<ObjectTypeDefinition>(
      await store.listObjectTypes(rid),
    );
    return paginateArray(
      objectTypes.map((def) => toV1ObjectType(rid, def)),
      request.query,
    );
  });

  // Get object type
  app.get<{
    Params: { ontologyRid: string; objectType: string };
  }>("/ontologies/:ontologyRid/objectTypes/:objectType", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const { rid } = await resolveOntology(request.params.ontologyRid);
    return toV1ObjectType(
      rid,
      await store.getObjectType(rid, request.params.objectType),
    );
  });

  // List the outgoing link types of an object type
  app.get<{
    Params: { ontologyRid: string; objectType: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/objectTypes/:objectType/outgoingLinkTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const { rid } = await resolveOntology(request.params.ontologyRid);
    const { objectType } = request.params;
    const links = asArray<LinkTypeDefinition>(
      await store.listLinkTypesForObjectType(rid, objectType),
    );
    // Only the links this object type is the *source* of are outgoing.
    const outgoing = links
      .filter((link) => link.objectTypeApiName === objectType)
      .map(toV1LinkTypeSide);
    return paginateArray(outgoing, request.query);
  });

  // -----------------------------------------------------------------------
  // Action types
  // -----------------------------------------------------------------------

  // List action types
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/actionTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const { rid } = await resolveOntology(request.params.ontologyRid);
    const actionTypes = asArray<ActionTypeDefinition>(
      await store.listActionTypes(rid),
    );
    return paginateArray(
      actionTypes.map((def) => toV1ActionType(rid, def)),
      request.query,
    );
  });

  // Get action type
  app.get<{
    Params: { ontologyRid: string; actionTypeApiName: string };
  }>("/ontologies/:ontologyRid/actionTypes/:actionTypeApiName", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const { rid } = await resolveOntology(request.params.ontologyRid);
    return toV1ActionType(
      rid,
      await store.getActionType(rid, request.params.actionTypeApiName),
    );
  });

  // -----------------------------------------------------------------------
  // Query types
  // -----------------------------------------------------------------------

  // List query types.
  //
  // Always empty, for the same reason the v2 route is: OpenFoundry registers no
  // Foundry query types. `ListQueryTypesResponse` requires only `data`, so an
  // empty page is a conformant answer rather than a stub.
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/queryTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    await resolveOntology(request.params.ontologyRid);
    return paginateArray([], request.query);
  });
}
