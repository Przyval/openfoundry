import type { FastifyInstance } from "fastify";
import type { OntologyStore, StoredOntology } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";
import { parseBooleanParam } from "./query-params.js";

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

/**
 * One entry of the `fullLogicRules` list Foundry returns for an action type.
 *
 * Only the object-mutating rules are modelled: those are the operations
 * OpenFoundry action types actually record.
 */
type ActionLogicRule =
  | {
      type: "createObject";
      objectTypeApiName: string;
      propertyArguments: Record<string, unknown>;
      structPropertyArguments: Record<string, unknown>;
    }
  | {
      type: "modifyObject";
      objectToModify: string;
      propertyArguments: Record<string, unknown>;
      structPropertyArguments: Record<string, unknown>;
    };

/** The subset of an action type definition this module reads. */
interface ActionTypeShape {
  apiName: string;
  parameters?: Record<string, { objectTypeApiName?: string }>;
  modifiedEntities?: Record<string, { created?: boolean; modified?: boolean }>;
}

/**
 * Derives an action type's logic rules from the entities it declares it
 * modifies.
 *
 * `modifiedEntities` is the same information Foundry publishes as an action
 * type's operations, so a `created` entity becomes a `createObject` rule and a
 * `modified` entity becomes a `modifyObject` rule. A `modifyObject` rule names
 * the parameter carrying the object to modify, which is derivable only when a
 * parameter declares that object type; when none does, the rule is omitted
 * rather than invented. Property-level argument wiring is left empty because
 * OpenFoundry action types do not record which parameter feeds which property.
 */
function deriveLogicRules(actionType: ActionTypeShape): ActionLogicRule[] {
  const rules: ActionLogicRule[] = [];
  const parameters = actionType.parameters ?? {};

  for (const [objectTypeApiName, entity] of Object.entries(
    actionType.modifiedEntities ?? {},
  )) {
    if (entity?.created) {
      rules.push({
        type: "createObject",
        objectTypeApiName,
        propertyArguments: {},
        structPropertyArguments: {},
      });
    }
    if (entity?.modified) {
      const objectToModify = Object.entries(parameters).find(
        ([, param]) => param?.objectTypeApiName === objectTypeApiName,
      )?.[0];
      if (objectToModify !== undefined) {
        rules.push({
          type: "modifyObject",
          objectToModify,
          propertyArguments: {},
          structPropertyArguments: {},
        });
      }
    }
  }

  return rules;
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
    Querystring: { includeActionTypeFullMetadata?: string };
  }>("/ontologies/:ontologyRid/fullMetadata", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const rid = request.params.ontologyRid;
    const includeActionTypeFullMetadata = parseBooleanParam(
      "includeActionTypeFullMetadata",
      request.query.includeActionTypeFullMetadata,
    );
    const [ontology, objectTypes, actionTypes, linkTypes, interfaceTypes] = await Promise.all([
      store.getOntology(rid),
      Promise.resolve(store.listObjectTypes(rid)),
      Promise.resolve(store.listActionTypes(rid)),
      Promise.resolve(store.listLinkTypes(rid)),
      Promise.resolve(store.listInterfaceTypes(rid)),
    ]);

    // `actionTypes` is always populated; `actionTypesFullMetadata` only when
    // the caller opted in, which is exactly what the flag controls.
    const actionTypeList = (Array.isArray(actionTypes)
      ? actionTypes
      : []) as unknown as ActionTypeShape[];
    const actionTypesFullMetadata = includeActionTypeFullMetadata === true
      ? Object.fromEntries(
          actionTypeList.map((actionType) => [
            actionType.apiName,
            { actionType, fullLogicRules: deriveLogicRules(actionType) },
          ]),
        )
      : undefined;

    return {
      ...serializeOntology(ontology),
      objectTypes,
      actionTypes,
      linkTypes,
      interfaceTypes,
      ...(actionTypesFullMetadata !== undefined
        ? { actionTypesFullMetadata }
        : {}),
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
