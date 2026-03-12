import type pg from "pg";
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
import type {
  CreatePipelineInput,
  UpdatePipelineInput,
  CreatePipelineRunInput,
} from "./pipeline-store.js";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface PipelineRow {
  rid: string;
  name: string;
  description: string | null;
  steps: PipelineStep[];
  schedule: PipelineSchedule | null;
  input_datasets: string[];
  output_dataset: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PipelineRunRow {
  rid: string;
  pipeline_rid: string;
  status: string;
  step_results: StepResult[];
  rows_processed: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToPipeline(row: PipelineRow): PipelineDefinition {
  return {
    rid: row.rid,
    name: row.name,
    description: row.description ?? undefined,
    steps: row.steps,
    schedule: row.schedule ?? undefined,
    inputDatasets: row.input_datasets ?? [],
    outputDataset: row.output_dataset ?? "",
    status: row.status as PipelineStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToRun(row: PipelineRunRow): PipelineRun {
  return {
    rid: row.rid,
    pipelineRid: row.pipeline_rid,
    status: row.status as PipelineRunStatus,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    stepResults: row.step_results ?? [],
    rowsProcessed: row.rows_processed,
    error: row.error ?? undefined,
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

// ---------------------------------------------------------------------------
// PgPipelineStore
// ---------------------------------------------------------------------------

export class PgPipelineStore {
  constructor(private pool: pg.Pool) {}

  // -----------------------------------------------------------------------
  // Pipeline CRUD
  // -----------------------------------------------------------------------

  async createPipeline(
    input: CreatePipelineInput,
  ): Promise<PipelineDefinition> {
    const rid = generateRid("pipeline-builder", "pipeline").toString();

    try {
      const { rows } = await this.pool.query<PipelineRow>({
        text: `INSERT INTO pipelines (rid, name, description, steps, schedule, input_datasets, output_dataset)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *`,
        values: [
          rid,
          input.name,
          input.description ?? null,
          JSON.stringify(input.steps),
          input.schedule ? JSON.stringify(input.schedule) : null,
          input.inputDatasets,
          input.outputDataset,
        ],
      });

      return rowToPipeline(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Pipeline", `name "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async getPipeline(rid: string): Promise<PipelineDefinition> {
    const { rows } = await this.pool.query<PipelineRow>({
      text: `SELECT * FROM pipelines WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Pipeline", rid);
    }
    return rowToPipeline(rows[0]);
  }

  async listPipelines(): Promise<PipelineDefinition[]> {
    const { rows } = await this.pool.query<PipelineRow>({
      text: `SELECT * FROM pipelines ORDER BY created_at ASC`,
    });

    return rows.map(rowToPipeline);
  }

  async updatePipeline(
    rid: string,
    input: UpdatePipelineInput,
  ): Promise<PipelineDefinition> {
    // Verify exists
    await this.getPipeline(rid);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.steps !== undefined) {
      setClauses.push(`steps = $${paramIndex++}`);
      values.push(JSON.stringify(input.steps));
    }
    if (input.schedule !== undefined) {
      setClauses.push(`schedule = $${paramIndex++}`);
      values.push(JSON.stringify(input.schedule));
    }
    if (input.inputDatasets !== undefined) {
      setClauses.push(`input_datasets = $${paramIndex++}`);
      values.push(input.inputDatasets);
    }
    if (input.outputDataset !== undefined) {
      setClauses.push(`output_dataset = $${paramIndex++}`);
      values.push(input.outputDataset);
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (setClauses.length === 0) {
      return this.getPipeline(rid);
    }

    values.push(rid);

    try {
      const { rows } = await this.pool.query<PipelineRow>({
        text: `UPDATE pipelines SET ${setClauses.join(", ")} WHERE rid = $${paramIndex} RETURNING *`,
        values,
      });

      return rowToPipeline(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Pipeline", `name "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async deletePipeline(rid: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM pipelines WHERE rid = $1`,
      values: [rid],
    });

    if (result.rowCount === 0) {
      throw notFound("Pipeline", rid);
    }
  }

  // -----------------------------------------------------------------------
  // Pipeline runs
  // -----------------------------------------------------------------------

  async createRun(input: CreatePipelineRunInput): Promise<PipelineRun> {
    // Verify pipeline exists
    await this.getPipeline(input.pipelineRid);

    const rid = generateRid("pipeline-builder", "run").toString();
    const status = input.status ?? "QUEUED";
    const terminal = ["SUCCEEDED", "FAILED", "CANCELLED"];

    const { rows } = await this.pool.query<PipelineRunRow>({
      text: `INSERT INTO pipeline_runs (rid, pipeline_rid, status, step_results, rows_processed, completed_at, error)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
      values: [
        rid,
        input.pipelineRid,
        status,
        JSON.stringify(input.stepResults ?? []),
        input.rowsProcessed ?? 0,
        terminal.includes(status) ? new Date().toISOString() : null,
        input.error ?? null,
      ],
    });

    return rowToRun(rows[0]);
  }

  async getRun(
    pipelineRid: string,
    runRid: string,
  ): Promise<PipelineRun> {
    await this.getPipeline(pipelineRid);

    const { rows } = await this.pool.query<PipelineRunRow>({
      text: `SELECT * FROM pipeline_runs WHERE rid = $1 AND pipeline_rid = $2`,
      values: [runRid, pipelineRid],
    });

    if (rows.length === 0) {
      throw notFound("PipelineRun", runRid);
    }
    return rowToRun(rows[0]);
  }

  async listRuns(pipelineRid: string): Promise<PipelineRun[]> {
    await this.getPipeline(pipelineRid);

    const { rows } = await this.pool.query<PipelineRunRow>({
      text: `SELECT * FROM pipeline_runs WHERE pipeline_rid = $1 ORDER BY started_at DESC`,
      values: [pipelineRid],
    });

    return rows.map(rowToRun);
  }

  async updateRunStatus(
    runRid: string,
    status: PipelineRunStatus,
    stepResults?: StepResult[],
    rowsProcessed?: number,
    error?: string,
  ): Promise<PipelineRun> {
    const { rows: existing } = await this.pool.query<PipelineRunRow>({
      text: `SELECT * FROM pipeline_runs WHERE rid = $1`,
      values: [runRid],
    });

    if (existing.length === 0) {
      throw notFound("PipelineRun", runRid);
    }

    const terminal = ["SUCCEEDED", "FAILED", "CANCELLED"];
    if (terminal.includes(existing[0].status)) {
      throw invalidArgument(
        "status",
        `run is already in terminal state "${existing[0].status}"`,
      );
    }

    const setClauses: string[] = ["status = $1"];
    const values: unknown[] = [status];
    let idx = 2;

    if (stepResults !== undefined) {
      setClauses.push(`step_results = $${idx++}`);
      values.push(JSON.stringify(stepResults));
    }
    if (rowsProcessed !== undefined) {
      setClauses.push(`rows_processed = $${idx++}`);
      values.push(rowsProcessed);
    }
    if (error !== undefined) {
      setClauses.push(`error = $${idx++}`);
      values.push(error);
    }
    if (terminal.includes(status)) {
      setClauses.push(`completed_at = $${idx++}`);
      values.push(new Date().toISOString());
    }

    values.push(runRid);

    const { rows } = await this.pool.query<PipelineRunRow>({
      text: `UPDATE pipeline_runs SET ${setClauses.join(", ")} WHERE rid = $${idx} RETURNING *`,
      values,
    });

    return rowToRun(rows[0]);
  }
}
