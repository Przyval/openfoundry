import type { FastifyInstance } from "fastify";
import { notFound, invalidArgument } from "@openfoundry/errors";
import { requirePermission } from "@openfoundry/permissions";
import type { ActionRegistry } from "../../store/action-registry.js";
import type { ActionLog } from "../../store/action-log.js";
import { validateActionParameters } from "../../validation.js";

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

interface ActionParams {
  Params: {
    ontologyRid: string;
    actionApiName: string;
  };
}

interface ExecutionParams {
  Params: {
    ontologyRid: string;
    actionApiName: string;
    executionRid: string;
  };
}

interface ApplyBody {
  Body: {
    parameters: Record<string, unknown>;
  };
}

interface ValidateBody {
  Body: {
    parameters: Record<string, unknown>;
  };
}

interface BatchBody {
  Body: {
    requests: Array<{ parameters: Record<string, unknown> }>;
  };
}

interface ExecutionsQuery {
  Querystring: {
    pageSize?: string;
    pageToken?: string;
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface ActionRoutesOptions {
  registry: ActionRegistry;
  log: ActionLog;
}

export async function actionRoutes(
  app: FastifyInstance,
  options: ActionRoutesOptions,
): Promise<void> {
  const { registry, log } = options;

  // -----------------------------------------------------------------------
  // POST /api/v2/ontologies/:ontologyRid/actions/:actionApiName/apply
  // -----------------------------------------------------------------------
  app.post<ActionParams & ApplyBody>(
    "/ontologies/:ontologyRid/actions/:actionApiName/apply",
    {
      preHandler: requirePermission("actions:execute"),
    },
    async (request, reply) => {
      const { ontologyRid, actionApiName } = request.params;
      const { parameters = {} } = request.body ?? {};

      const action = registry.getAction(actionApiName);
      if (!action) {
        throw notFound("Action", actionApiName);
      }

      // Validate
      const validation = validateActionParameters(parameters, action);
      if (!validation.valid) {
        return reply.status(400).send({
          errorCode: "INVALID_ARGUMENT",
          errorName: "ValidationError",
          errorInstanceId: crypto.randomUUID(),
          parameters: { validationErrors: validation.errors },
          statusCode: 400,
        });
      }

      // Execute
      const execution = log.logStart(actionApiName, parameters);

      try {
        let result: Record<string, unknown> | undefined;

        if (action.handler) {
          const handlerResult = await action.handler(parameters, {
            ontologyRid,
            actionApiName,
          });
          result = handlerResult.result;
        }

        log.logComplete(execution.rid, result);

        return reply.status(200).send({
          rid: execution.rid,
          status: "SUCCEEDED",
          ...(result ? { result } : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.logFailure(execution.rid, message);

        return reply.status(500).send({
          errorCode: "INTERNAL",
          errorName: "ActionExecutionFailed",
          errorInstanceId: crypto.randomUUID(),
          parameters: { actionApiName, error: message },
          statusCode: 500,
        });
      }
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/v2/ontologies/:ontologyRid/actions/:actionApiName/validate
  // -----------------------------------------------------------------------
  app.post<ActionParams & ValidateBody>(
    "/ontologies/:ontologyRid/actions/:actionApiName/validate",
    {
      preHandler: requirePermission("actions:read"),
    },
    async (request, _reply) => {
      const { actionApiName } = request.params;
      const { parameters = {} } = request.body ?? {};

      const action = registry.getAction(actionApiName);
      if (!action) {
        throw notFound("Action", actionApiName);
      }

      const validation = validateActionParameters(parameters, action);

      return {
        valid: validation.valid,
        ...(validation.errors.length > 0
          ? { errors: validation.errors }
          : {}),
      };
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/v2/ontologies/:ontologyRid/actions/:actionApiName/applyBatch
  // -----------------------------------------------------------------------
  app.post<ActionParams & BatchBody>(
    "/ontologies/:ontologyRid/actions/:actionApiName/applyBatch",
    {
      preHandler: requirePermission("actions:execute"),
    },
    async (request, reply) => {
      const { ontologyRid, actionApiName } = request.params;
      const { requests } = request.body ?? {};

      if (!requests || !Array.isArray(requests)) {
        throw invalidArgument("requests", "must be an array");
      }

      const action = registry.getAction(actionApiName);
      if (!action) {
        throw notFound("Action", actionApiName);
      }

      const results: Array<{
        rid: string;
        status: string;
        result?: Record<string, unknown>;
        error?: string;
      }> = [];

      for (const req of requests) {
        const parameters = req.parameters ?? {};

        // Validate
        const validation = validateActionParameters(parameters, action);
        if (!validation.valid) {
          const execution = log.logStart(actionApiName, parameters);
          const errorMsg = validation.errors
            .map((e) => e.message)
            .join("; ");
          log.logFailure(execution.rid, errorMsg);
          results.push({
            rid: execution.rid,
            status: "FAILED",
            error: errorMsg,
          });
          continue;
        }

        // Execute
        const execution = log.logStart(actionApiName, parameters);

        try {
          let result: Record<string, unknown> | undefined;

          if (action.handler) {
            const handlerResult = await action.handler(parameters, {
              ontologyRid,
              actionApiName,
            });
            result = handlerResult.result;
          }

          log.logComplete(execution.rid, result);
          results.push({
            rid: execution.rid,
            status: "SUCCEEDED",
            ...(result ? { result } : {}),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.logFailure(execution.rid, message);
          results.push({
            rid: execution.rid,
            status: "FAILED",
            error: message,
          });
        }
      }

      return reply.status(200).send({ results });
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/v2/ontologies/:ontologyRid/actions/:actionApiName/executions
  // -----------------------------------------------------------------------
  app.get<ActionParams & ExecutionsQuery>(
    "/ontologies/:ontologyRid/actions/:actionApiName/executions",
    {
      preHandler: requirePermission("actions:read"),
    },
    async (request, _reply) => {
      const { actionApiName } = request.params;
      const { pageSize, pageToken } = request.query;

      const action = registry.getAction(actionApiName);
      if (!action) {
        throw notFound("Action", actionApiName);
      }

      const result = log.listExecutions(actionApiName, {
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        pageToken,
      });

      return {
        data: result.data,
        ...(result.nextPageToken
          ? { nextPageToken: result.nextPageToken }
          : {}),
      };
    },
  );

  // -----------------------------------------------------------------------
  // GET /api/v2/ontologies/:ontologyRid/actions/:actionApiName/executions/:executionRid
  // -----------------------------------------------------------------------
  app.get<ExecutionParams>(
    "/ontologies/:ontologyRid/actions/:actionApiName/executions/:executionRid",
    {
      preHandler: requirePermission("actions:read"),
    },
    async (request, _reply) => {
      const { actionApiName, executionRid } = request.params;

      const action = registry.getAction(actionApiName);
      if (!action) {
        throw notFound("Action", actionApiName);
      }

      const execution = log.getExecution(executionRid);
      if (!execution) {
        throw notFound("Execution", executionRid);
      }

      return execution;
    },
  );
}
