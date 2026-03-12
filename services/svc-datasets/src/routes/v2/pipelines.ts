import type { FastifyInstance } from "fastify";
import { validateDag, PipelineExecutor } from "@openfoundry/pipeline";
import type { PipelineStep, PipelineStatus, PipelineSchedule } from "@openfoundry/pipeline";
import type { CreatePipelineInput, UpdatePipelineInput } from "../../store/pipeline-store.js";
import type { PipelineStore } from "../../store/pipeline-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializePipeline(p: {
  rid: string;
  name: string;
  description?: string;
  steps: unknown[];
  schedule?: unknown;
  inputDatasets: string[];
  outputDataset: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    rid: p.rid,
    name: p.name,
    description: p.description,
    steps: p.steps,
    schedule: p.schedule,
    inputDatasets: p.inputDatasets,
    outputDataset: p.outputDataset,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function serializeRun(r: {
  rid: string;
  pipelineRid: string;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  stepResults: unknown[];
  rowsProcessed: number;
  error?: string;
}) {
  return {
    rid: r.rid,
    pipelineRid: r.pipelineRid,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    stepResults: r.stepResults,
    rowsProcessed: r.rowsProcessed,
    error: r.error ?? null,
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function pipelineRoutes(
  app: FastifyInstance,
  opts: { pipelineStore: PipelineStore },
): Promise<void> {
  const { pipelineStore } = opts;

  // -----------------------------------------------------------------------
  // Pipeline CRUD
  // -----------------------------------------------------------------------

  // List pipelines (paginated)
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/pipelines", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const all = pipelineStore.listPipelines().map(serializePipeline);
    return paginateArray(all, request.query);
  });

  // Create pipeline
  app.post<{
    Body: {
      name: string;
      description?: string;
      steps: Array<{
        id: string;
        name: string;
        type: string;
        config: Record<string, unknown>;
        dependsOn?: string[];
      }>;
      schedule?: { type: string; interval?: number; cron?: string };
      inputDatasets: string[];
      outputDataset: string;
    };
  }>("/pipelines", {
    preHandler: requirePermission("datasets:write"),
  }, async (request, reply) => {
    const input: CreatePipelineInput = {
      ...request.body,
      steps: request.body.steps as PipelineStep[],
      schedule: request.body.schedule as PipelineSchedule | undefined,
    };
    const pipeline = pipelineStore.createPipeline(input);
    reply.status(201);
    return serializePipeline(pipeline);
  });

  // Get pipeline by RID
  app.get<{
    Params: { pipelineRid: string };
  }>("/pipelines/:pipelineRid", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const pipeline = pipelineStore.getPipeline(request.params.pipelineRid);
    return serializePipeline(pipeline);
  });

  // Update pipeline
  app.put<{
    Params: { pipelineRid: string };
    Body: {
      name?: string;
      description?: string;
      steps?: Array<{
        id: string;
        name: string;
        type: string;
        config: Record<string, unknown>;
        dependsOn?: string[];
      }>;
      schedule?: { type: string; interval?: number; cron?: string };
      inputDatasets?: string[];
      outputDataset?: string;
      status?: string;
    };
  }>("/pipelines/:pipelineRid", {
    preHandler: requirePermission("datasets:write"),
  }, async (request) => {
    const input: UpdatePipelineInput = {
      ...request.body,
      steps: request.body.steps as PipelineStep[] | undefined,
      schedule: request.body.schedule as PipelineSchedule | undefined,
      status: request.body.status as PipelineStatus | undefined,
    };
    const pipeline = pipelineStore.updatePipeline(
      request.params.pipelineRid,
      input,
    );
    return serializePipeline(pipeline);
  });

  // Delete pipeline
  app.delete<{
    Params: { pipelineRid: string };
  }>("/pipelines/:pipelineRid", {
    preHandler: requirePermission("datasets:delete"),
  }, async (request, reply) => {
    pipelineStore.deletePipeline(request.params.pipelineRid);
    reply.status(204);
    return;
  });

  // -----------------------------------------------------------------------
  // Pipeline runs
  // -----------------------------------------------------------------------

  // Trigger a pipeline run
  app.post<{
    Params: { pipelineRid: string };
    Body: { inputData?: Record<string, unknown>[] };
  }>("/pipelines/:pipelineRid/runs", {
    preHandler: requirePermission("datasets:write"),
  }, async (request, reply) => {
    const pipeline = pipelineStore.getPipeline(request.params.pipelineRid);

    // Create a run record
    let run = pipelineStore.createRun({
      pipelineRid: pipeline.rid,
      status: "RUNNING",
    });

    // Execute the pipeline if input data is provided
    const inputData = request.body?.inputData ?? [];
    const executor = new PipelineExecutor();
    const result = executor.execute(pipeline, inputData);

    // Update the run with results
    run = pipelineStore.updateRunStatus(
      run.rid,
      result.status,
      result.stepResults,
      result.rowsProcessed,
      result.error,
    );

    reply.status(201);
    return serializeRun(run);
  });

  // List runs for a pipeline
  app.get<{
    Params: { pipelineRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/pipelines/:pipelineRid/runs", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const all = pipelineStore
      .listRuns(request.params.pipelineRid)
      .map(serializeRun);
    return paginateArray(all, request.query);
  });

  // Get run details
  app.get<{
    Params: { pipelineRid: string; runRid: string };
  }>("/pipelines/:pipelineRid/runs/:runRid", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const run = pipelineStore.getRun(
      request.params.pipelineRid,
      request.params.runRid,
    );
    return serializeRun(run);
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  // Validate a pipeline definition (DAG check)
  app.post<{
    Body: {
      steps: Array<{
        id: string;
        name: string;
        type: string;
        config: Record<string, unknown>;
        dependsOn?: string[];
      }>;
    };
  }>("/pipelines/validate", {
    preHandler: requirePermission("datasets:read"),
  }, async (request) => {
    const result = validateDag(request.body.steps as PipelineStep[]);
    return result;
  });
}
