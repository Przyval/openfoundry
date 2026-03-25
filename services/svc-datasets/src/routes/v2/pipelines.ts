import type { FastifyInstance } from "fastify";
import { validateDag, PipelineExecutor, topologicalSort } from "@openfoundry/pipeline";
import type { PipelineStep, PipelineStatus, PipelineSchedule } from "@openfoundry/pipeline";
import type { CreatePipelineInput, UpdatePipelineInput } from "../../store/pipeline-store.js";
import type { PipelineStore } from "../../store/pipeline-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

// ---------------------------------------------------------------------------
// Helper: fetch objects from svc-objects
// ---------------------------------------------------------------------------

const OBJECTS_SERVICE_URL =
  process.env.OBJECTS_SERVICE_URL ?? "http://localhost:8082";

/**
 * Fetch all objects of a given type from svc-objects, paginating through
 * all pages. Returns a flat array of property maps (rows).
 */
async function fetchSourceObjects(
  objectType: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  const pageSize = 500;

  // We use the direct REST list endpoint on svc-objects
  // Route: GET /api/v2/ontologies/:ontologyRid/objects/:objectType
  // We use a placeholder ontology RID since the in-memory store ignores it.
  const ontologyRid = "default";

  do {
    const qs = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) qs.set("pageToken", pageToken);

    const res = await fetch(
      `${OBJECTS_SERVICE_URL}/api/v2/ontologies/${ontologyRid}/objects/${objectType}?${qs}`,
      { headers: { "Content-Type": "application/json" } },
    );

    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${objectType} objects: HTTP ${res.status}`,
      );
    }

    const body = (await res.json()) as {
      data: Array<{
        rid: string;
        objectType: string;
        primaryKey: string;
        properties: Record<string, unknown>;
      }>;
      nextPageToken?: string;
    };

    // Flatten each object to a row: merge primaryKey + properties
    for (const obj of body.data) {
      rows.push({
        __rid: obj.rid,
        __primaryKey: obj.primaryKey,
        __objectType: obj.objectType,
        ...obj.properties,
      });
    }

    pageToken = body.nextPageToken;
  } while (pageToken);

  return rows;
}

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
// Local step execution (mirrors PipelineExecutor logic for data extraction)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function executeStepLocal(step: PipelineStep, data: Row[]): Row[] {
  const config = step.config;

  switch (step.type) {
    case "FILTER": {
      const field = config.field as string;
      const operator = config.operator as string;
      const value = config.value;
      return data.filter((row) => {
        const v = row[field];
        switch (operator) {
          case "eq": return v === value;
          case "neq": return v !== value;
          case "gt": return (v as number) > (value as number);
          case "gte": return (v as number) >= (value as number);
          case "lt": return (v as number) < (value as number);
          case "lte": return (v as number) <= (value as number);
          case "contains": return String(v).includes(String(value));
          case "startsWith": return String(v).startsWith(String(value));
          case "in": return Array.isArray(value) && value.includes(v);
          default: return true;
        }
      });
    }

    case "MAP": {
      const mappings = config.mappings as Array<{
        source: string;
        target: string;
        transform?: string;
      }>;
      return data.map((row) => {
        const result: Row = {};
        for (const m of mappings) {
          let v = row[m.source];
          if (m.transform === "uppercase") v = String(v).toUpperCase();
          else if (m.transform === "lowercase") v = String(v).toLowerCase();
          else if (m.transform === "trim") v = String(v).trim();
          else if (m.transform === "toNumber") v = Number(v);
          result[m.target] = v;
        }
        return result;
      });
    }

    case "AGGREGATE": {
      const groupBy = config.groupBy as string[];
      const aggregations = config.aggregations as Array<{
        field: string;
        function: string;
        alias: string;
      }>;
      const groups = new Map<string, Row[]>();
      for (const row of data) {
        const key = groupBy.map((f) => String(row[f])).join("||");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
      const results: Row[] = [];
      for (const [, groupRows] of groups) {
        const result: Row = {};
        for (const f of groupBy) result[f] = groupRows[0][f];
        for (const agg of aggregations) {
          const values = groupRows.map((r) => r[agg.field]);
          switch (agg.function) {
            case "count": result[agg.alias] = values.length; break;
            case "sum":
              result[agg.alias] = values.reduce(
                (acc: number, v) => acc + Number(v), 0,
              );
              break;
            case "avg": {
              const sum = values.reduce((acc: number, v) => acc + Number(v), 0);
              result[agg.alias] = Math.round((sum / values.length) * 100) / 100;
              break;
            }
            case "min":
              result[agg.alias] = Math.min(...values.map((v) => Number(v)));
              break;
            case "max":
              result[agg.alias] = Math.max(...values.map((v) => Number(v)));
              break;
          }
        }
        results.push(result);
      }
      return results;
    }

    case "SORT": {
      const fields = config.fields as Array<{
        field: string;
        direction: string;
      }>;
      return [...data].sort((a, b) => {
        for (const f of fields) {
          const aVal = a[f.field];
          const bVal = b[f.field];
          let cmp = 0;
          if (typeof aVal === "number" && typeof bVal === "number") {
            cmp = aVal - bVal;
          } else {
            cmp = String(aVal).localeCompare(String(bVal));
          }
          if (cmp !== 0) return f.direction === "desc" ? -cmp : cmp;
        }
        return 0;
      });
    }

    case "DEDUPLICATE": {
      const keys = config.keys as string[];
      const seen = new Set<string>();
      return data.filter((row) => {
        const key = keys.map((k) => JSON.stringify(row[k])).join("||");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    case "DERIVE": {
      const deriveFields = config.fields as Array<{
        name: string;
        expression: string;
      }>;
      return data.map((row) => {
        const result: Row = { ...row };
        for (const field of deriveFields) {
          try {
            const fn = new Function("row", `return (${field.expression});`) as (
              r: Row,
            ) => unknown;
            result[field.name] = fn(row);
          } catch {
            result[field.name] = null;
          }
        }
        return result;
      });
    }

    case "LIMIT": {
      const limit = (config.limit as number) ?? data.length;
      return data.slice(0, limit);
    }

    case "CUSTOM": {
      const expression = (config as Record<string, string>).expression ?? "true";
      try {
        const fn = new Function("row", `return (${expression});`) as (
          r: Row,
        ) => unknown;
        return data.filter((row) => {
          try { return Boolean(fn(row)); } catch { return false; }
        });
      } catch { return data; }
    }

    default:
      return data;
  }
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

  // -----------------------------------------------------------------------
  // Execute pipeline with real data from svc-objects
  // -----------------------------------------------------------------------

  app.post<{
    Params: { pipelineRid: string };
  }>("/pipelines/:pipelineRid/execute", {
    preHandler: requirePermission("datasets:write"),
  }, async (request, reply) => {
    const startTime = performance.now();
    const pipeline = pipelineStore.getPipeline(request.params.pipelineRid);

    // 1. Determine the source object type from pipeline metadata.
    //    Convention: first inputDataset is the objectType name.
    const sourceObjectType = pipeline.inputDatasets[0];
    if (!sourceObjectType) {
      reply.status(400);
      return {
        error: "Pipeline has no source object type defined in inputDatasets",
      };
    }

    // 2. Fetch source data from svc-objects
    let sourceRows: Record<string, unknown>[];
    try {
      sourceRows = await fetchSourceObjects(sourceObjectType);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Record a failed run
      const failedRun = pipelineStore.createRun({
        pipelineRid: pipeline.rid,
        status: "FAILED",
        rowsProcessed: 0,
        error: `Failed to fetch source data: ${msg}`,
      });
      reply.status(502);
      return {
        ...serializeRun(failedRun),
        resultData: [],
        resultColumns: [],
        executionMs: Math.round(performance.now() - startTime),
      };
    }

    // 3. Execute the pipeline transform steps
    const executor = new PipelineExecutor();
    const result = executor.execute(pipeline, sourceRows);

    // 4. Record the run in the store
    const run = pipelineStore.createRun({
      pipelineRid: pipeline.rid,
      status: result.status,
      stepResults: result.stepResults,
      rowsProcessed: result.rowsProcessed,
      error: result.error,
    });

    // 5. Extract the transformed output rows.
    //    Re-execute to capture output data (the executor returns a PipelineRun,
    //    not the data itself), so we replay locally.
    let outputRows: Record<string, unknown>[] = sourceRows;
    try {
      // The executor returns a PipelineRun (metadata), not the output data,
      // so we replay the transform steps locally to capture the result rows.
      const sortedSteps = topologicalSort(pipeline.steps);
      const stepOutputs = new Map<string, Record<string, unknown>[]>();

      for (const step of sortedSteps) {
        if (step.dependsOn && step.dependsOn.length > 0) {
          const lastDep = step.dependsOn[step.dependsOn.length - 1];
          const depOut = stepOutputs.get(lastDep);
          if (depOut) outputRows = depOut;
        }
        // Use private executeStep via a small local re-implementation
        outputRows = executeStepLocal(step, outputRows);
        stepOutputs.set(step.id, outputRows);
      }
    } catch {
      // If replay fails, return empty — the run record still has step results
      outputRows = [];
    }

    // 6. Determine column names from the first output row
    const resultColumns =
      outputRows.length > 0
        ? Object.keys(outputRows[0]).filter((k) => !k.startsWith("__"))
        : [];

    // Strip internal __prefixed keys from output
    const cleanRows = outputRows.map((row) => {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k.startsWith("__")) clean[k] = v;
      }
      return clean;
    });

    const executionMs = Math.round(performance.now() - startTime);

    reply.status(200);
    return {
      ...serializeRun(run),
      resultData: cleanRows,
      resultColumns,
      sourceRowCount: sourceRows.length,
      outputRowCount: cleanRows.length,
      executionMs,
    };
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
