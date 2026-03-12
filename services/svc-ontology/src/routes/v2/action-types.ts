import type { FastifyInstance } from "fastify";
import type { ActionTypeDefinition } from "@openfoundry/ontology-schema";
import type { OntologyStore } from "../../store/ontology-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

export async function actionTypeRoutes(
  app: FastifyInstance,
  opts: { store: OntologyStore },
): Promise<void> {
  const { store } = opts;

  // List action types
  app.get<{
    Params: { ontologyRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/ontologies/:ontologyRid/actionTypes", {
    preHandler: requirePermission("ontology:read"),
  }, async (request) => {
    const all = store.listActionTypes(request.params.ontologyRid);
    return paginateArray(all, request.query);
  });

  // Create action type
  app.post<{
    Params: { ontologyRid: string };
    Body: ActionTypeDefinition;
  }>("/ontologies/:ontologyRid/actionTypes", {
    preHandler: requirePermission("ontology:write"),
  }, async (request, reply) => {
    const actionType = store.createActionType(
      request.params.ontologyRid,
      request.body,
    );
    reply.status(201);
    return actionType;
  });

  // Get action type by apiName
  app.get<{
    Params: { ontologyRid: string; actionTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/actionTypes/:actionTypeApiName",
    {
      preHandler: requirePermission("ontology:read"),
    },
    async (request) => {
      return store.getActionType(
        request.params.ontologyRid,
        request.params.actionTypeApiName,
      );
    },
  );

  // Update action type
  app.put<{
    Params: { ontologyRid: string; actionTypeApiName: string };
    Body: ActionTypeDefinition;
  }>(
    "/ontologies/:ontologyRid/actionTypes/:actionTypeApiName",
    {
      preHandler: requirePermission("ontology:write"),
    },
    async (request) => {
      return store.updateActionType(
        request.params.ontologyRid,
        request.params.actionTypeApiName,
        request.body,
      );
    },
  );

  // Delete action type
  app.delete<{
    Params: { ontologyRid: string; actionTypeApiName: string };
  }>(
    "/ontologies/:ontologyRid/actionTypes/:actionTypeApiName",
    {
      preHandler: requirePermission("ontology:delete"),
    },
    async (request, reply) => {
      store.deleteActionType(
        request.params.ontologyRid,
        request.params.actionTypeApiName,
      );
      reply.status(204);
      return;
    },
  );
}
