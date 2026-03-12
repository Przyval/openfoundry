import { generateRid } from "@openfoundry/rid";
import { notFound, conflict, invalidArgument } from "@openfoundry/errors";
import type {
  PipelineDefinition,
  PipelineStatus,
  PipelineStep,
  PipelineSchedule,
  PipelineRun,
  PipelineRunStatus,
  StepResult,
} from "@openfoundry/pipeline";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreatePipelineInput {
  name: string;
  description?: string;
  steps: PipelineStep[];
  schedule?: PipelineSchedule;
  inputDatasets: string[];
  outputDataset: string;
}

export interface UpdatePipelineInput {
  name?: string;
  description?: string;
  steps?: PipelineStep[];
  schedule?: PipelineSchedule;
  inputDatasets?: string[];
  outputDataset?: string;
  status?: PipelineStatus;
}

export interface CreatePipelineRunInput {
  pipelineRid: string;
  status?: PipelineRunStatus;
  stepResults?: StepResult[];
  rowsProcessed?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// PipelineStore — in-memory storage
// ---------------------------------------------------------------------------

export class PipelineStore {
  private readonly pipelines = new Map<string, PipelineDefinition>();
  private readonly runs = new Map<string, PipelineRun>();

  // -----------------------------------------------------------------------
  // Pipeline CRUD
  // -----------------------------------------------------------------------

  createPipeline(input: CreatePipelineInput): PipelineDefinition {
    // Check for duplicate name
    for (const p of this.pipelines.values()) {
      if (p.name === input.name) {
        throw conflict("Pipeline", `name "${input.name}" already exists`);
      }
    }

    const rid = generateRid("pipeline-builder", "pipeline").toString();
    const now = new Date();

    const pipeline: PipelineDefinition = {
      rid,
      name: input.name,
      description: input.description,
      steps: input.steps,
      schedule: input.schedule,
      inputDatasets: input.inputDatasets,
      outputDataset: input.outputDataset,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    this.pipelines.set(rid, pipeline);
    return pipeline;
  }

  getPipeline(rid: string): PipelineDefinition {
    const pipeline = this.pipelines.get(rid);
    if (!pipeline) {
      throw notFound("Pipeline", rid);
    }
    return pipeline;
  }

  listPipelines(): PipelineDefinition[] {
    return Array.from(this.pipelines.values());
  }

  updatePipeline(
    rid: string,
    input: UpdatePipelineInput,
  ): PipelineDefinition {
    const pipeline = this.getPipeline(rid);

    if (input.name !== undefined) {
      // Check for duplicate name with a different pipeline
      for (const p of this.pipelines.values()) {
        if (p.name === input.name && p.rid !== rid) {
          throw conflict("Pipeline", `name "${input.name}" already exists`);
        }
      }
      pipeline.name = input.name;
    }
    if (input.description !== undefined) pipeline.description = input.description;
    if (input.steps !== undefined) pipeline.steps = input.steps;
    if (input.schedule !== undefined) pipeline.schedule = input.schedule;
    if (input.inputDatasets !== undefined)
      pipeline.inputDatasets = input.inputDatasets;
    if (input.outputDataset !== undefined)
      pipeline.outputDataset = input.outputDataset;
    if (input.status !== undefined) pipeline.status = input.status;

    pipeline.updatedAt = new Date();

    return pipeline;
  }

  deletePipeline(rid: string): void {
    if (!this.pipelines.has(rid)) {
      throw notFound("Pipeline", rid);
    }
    // Also delete associated runs
    for (const [runRid, run] of this.runs) {
      if (run.pipelineRid === rid) {
        this.runs.delete(runRid);
      }
    }
    this.pipelines.delete(rid);
  }

  // -----------------------------------------------------------------------
  // Pipeline runs
  // -----------------------------------------------------------------------

  createRun(input: CreatePipelineRunInput): PipelineRun {
    // Verify pipeline exists
    this.getPipeline(input.pipelineRid);

    const rid = generateRid("pipeline-builder", "run").toString();
    const now = new Date();

    const run: PipelineRun = {
      rid,
      pipelineRid: input.pipelineRid,
      status: input.status ?? "QUEUED",
      startedAt: now,
      completedAt:
        input.status === "SUCCEEDED" || input.status === "FAILED"
          ? now
          : undefined,
      stepResults: input.stepResults ?? [],
      rowsProcessed: input.rowsProcessed ?? 0,
      error: input.error,
    };

    this.runs.set(rid, run);
    return run;
  }

  getRun(pipelineRid: string, runRid: string): PipelineRun {
    // Verify pipeline exists
    this.getPipeline(pipelineRid);

    const run = this.runs.get(runRid);
    if (!run || run.pipelineRid !== pipelineRid) {
      throw notFound("PipelineRun", runRid);
    }
    return run;
  }

  listRuns(pipelineRid: string): PipelineRun[] {
    // Verify pipeline exists
    this.getPipeline(pipelineRid);

    return Array.from(this.runs.values()).filter(
      (r) => r.pipelineRid === pipelineRid,
    );
  }

  updateRunStatus(
    runRid: string,
    status: PipelineRunStatus,
    stepResults?: StepResult[],
    rowsProcessed?: number,
    error?: string,
  ): PipelineRun {
    const run = this.runs.get(runRid);
    if (!run) {
      throw notFound("PipelineRun", runRid);
    }

    const terminal: PipelineRunStatus[] = [
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
    ];
    if (terminal.includes(run.status)) {
      throw invalidArgument(
        "status",
        `run is already in terminal state "${run.status}"`,
      );
    }

    run.status = status;
    if (stepResults) run.stepResults = stepResults;
    if (rowsProcessed !== undefined) run.rowsProcessed = rowsProcessed;
    if (error !== undefined) run.error = error;
    if (terminal.includes(status)) run.completedAt = new Date();

    return run;
  }
}
