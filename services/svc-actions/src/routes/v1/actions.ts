import type { FastifyInstance } from "fastify";
import { customClient, invalidArgument, notFound, safeArg } from "@openfoundry/errors";
import { requirePermission } from "@openfoundry/permissions";
import type { ActionRegistry, RegisteredAction } from "../../store/action-registry.js";
import type { ActionLog } from "../../store/action-log.js";
import { validateActionParameters } from "../../validation.js";

/**
 * `ontologies_models.ParameterEvaluationResult`.
 *
 * `evaluatedConstraints` is always empty: it lists the Ontology Manager
 * constraints - one-of sets, ranges, regexes, group membership - evaluated for
 * the parameter, and an OpenFoundry action parameter declares only a type and
 * whether it is required. There is no conformant constraint variant for "the
 * value is of the wrong type", so the failure is reported through `result`,
 * which is where a v1 client reads it.
 */
interface V1ParameterEvaluationResult {
  result: "VALID" | "INVALID";
  evaluatedConstraints: never[];
  required: boolean;
}

/** `ontologies_models.ValidateActionResponse`. */
interface V1ValidateActionResponse {
  result: "VALID" | "INVALID";
  /**
   * Always empty: submission criteria are the Ontology Manager prerequisites an
   * action must satisfy before it can be applied, and OpenFoundry action types
   * configure none.
   */
  submissionCriteria: never[];
  parameters: Record<string, V1ParameterEvaluationResult>;
}

function validateForV1(
  parameters: Record<string, unknown>,
  action: RegisteredAction,
): V1ValidateActionResponse {
  const validation = validateActionParameters(parameters, action);
  const failedParameters = new Set(
    validation.errors.map((error) => error.parameter),
  );

  return {
    result: validation.valid ? "VALID" : "INVALID",
    submissionCriteria: [],
    parameters: Object.fromEntries(
      [...action.parameters].map(([id, definition]) => [
        id,
        {
          result: failedParameters.has(id) ? "INVALID" : "VALID",
          evaluatedConstraints: [],
          required: definition.required,
        } satisfies V1ParameterEvaluationResult,
      ]),
    ),
  };
}

/**
 * The error Foundry returns when an action is applied with parameters that do
 * not validate.
 *
 * Name, status and parameter shape follow `ActionValidationFailed` in the
 * generated v1 SDK (`foundry_sdk/v1/ontologies/errors.py`): a
 * `BadRequestError` naming the action type. The parameter-level detail lives on
 * the `validate` operation, which is where the SDK's own message points.
 */
function actionValidationFailed(actionApiName: string): never {
  throw customClient(
    400,
    "ActionValidationFailed",
    "The validation failed for the given action parameters. Please use the `validateAction` endpoint for more details.",
    [safeArg("actionType", actionApiName)],
  );
}

export async function actionRoutesV1(
  app: FastifyInstance,
  options: { registry: ActionRegistry; log: ActionLog },
): Promise<void> {
  const { registry, log } = options;

  const requireAction = (actionApiName: string): RegisteredAction => {
    const action = registry.getAction(actionApiName);
    if (!action) throw notFound("Action", actionApiName);
    return action;
  };

  // -----------------------------------------------------------------------
  // Apply
  // -----------------------------------------------------------------------

  // Apply an action.
  //
  // `ApplyActionResponse` declares no fields at all, so a successful apply
  // answers with an empty object. The v2 route answers with OpenFoundry's own
  // `{ rid, status, result }`, which is why this is not an alias: a v1 client
  // reading that would take the execution rid for an edit summary.
  app.post<{
    Params: { ontologyRid: string; actionType: string };
    Body: { parameters?: Record<string, unknown> };
  }>("/ontologies/:ontologyRid/actions/:actionType/apply", {
    preHandler: requirePermission("actions:execute"),
  }, async (request) => {
    const { ontologyRid, actionType } = request.params;
    const parameters = request.body?.parameters ?? {};
    const action = requireAction(actionType);

    if (!validateActionParameters(parameters, action).valid) {
      actionValidationFailed(actionType);
    }

    const execution = log.logStart(actionType, parameters);
    try {
      const result = action.handler
        ? (await action.handler(parameters, { ontologyRid, actionApiName: actionType })).result
        : undefined;
      log.logComplete(execution.rid, result);
    } catch (err) {
      log.logFailure(execution.rid, err instanceof Error ? err.message : String(err));
      throw err;
    }

    return {};
  });

  // Apply an action to a batch of parameter sets.
  //
  // `BatchApplyActionResponse` also declares no fields, so the response says
  // nothing about the individual requests. Every request is therefore validated
  // before any of them runs: applying the valid ones and dropping the rest
  // would leave a v1 client with a success it cannot inspect.
  app.post<{
    Params: { ontologyRid: string; actionType: string };
    Body: { requests?: Array<{ parameters?: Record<string, unknown> }> };
  }>("/ontologies/:ontologyRid/actions/:actionType/applyBatch", {
    preHandler: requirePermission("actions:execute"),
  }, async (request) => {
    const { ontologyRid, actionType } = request.params;
    const requests = request.body?.requests;
    if (!Array.isArray(requests)) {
      throw invalidArgument("requests", "must be an array");
    }
    const action = requireAction(actionType);

    const parameterSets = requests.map((entry) => entry?.parameters ?? {});
    for (const parameters of parameterSets) {
      if (!validateActionParameters(parameters, action).valid) {
        actionValidationFailed(actionType);
      }
    }

    for (const parameters of parameterSets) {
      const execution = log.logStart(actionType, parameters);
      try {
        const result = action.handler
          ? (await action.handler(parameters, { ontologyRid, actionApiName: actionType })).result
          : undefined;
        log.logComplete(execution.rid, result);
      } catch (err) {
        log.logFailure(execution.rid, err instanceof Error ? err.message : String(err));
        throw err;
      }
    }

    return {};
  });

  // -----------------------------------------------------------------------
  // Validate
  // -----------------------------------------------------------------------

  // Validate an action's parameters.
  //
  // `ValidateActionResponse` is a per-parameter evaluation. The v2 route answers
  // with OpenFoundry's own `{ valid, errors }`, which shares no field name with
  // it.
  app.post<{
    Params: { ontologyRid: string; actionType: string };
    Body: { parameters?: Record<string, unknown> };
  }>("/ontologies/:ontologyRid/actions/:actionType/validate", {
    preHandler: requirePermission("actions:read"),
  }, async (request) => {
    const action = requireAction(request.params.actionType);
    return validateForV1(request.body?.parameters ?? {}, action);
  });
}
