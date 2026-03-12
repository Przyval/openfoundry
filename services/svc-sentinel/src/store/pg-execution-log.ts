import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";
import type { MonitorExecution, EffectResult } from "./execution-log.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface ExecutionRow {
  rid: string;
  monitor_rid: string;
  status: string;
  trigger_data: Record<string, unknown> | null;
  effect_results: EffectResult[];
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToExecution(row: ExecutionRow): MonitorExecution {
  return {
    rid: row.rid,
    monitorRid: row.monitor_rid,
    status: row.status as MonitorExecution["status"],
    triggerData: row.trigger_data ?? undefined,
    effectResults: row.effect_results ?? [],
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// PgExecutionLog
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed execution log for Sentinel monitor executions.
 */
export class PgExecutionLog {
  constructor(private pool: pg.Pool) {}

  async startExecution(
    monitorRid: string,
    triggerData?: Record<string, unknown>,
  ): Promise<MonitorExecution> {
    const rid = generateRid("sentinel", "execution").toString();

    const { rows } = await this.pool.query<ExecutionRow>({
      text: `INSERT INTO monitor_executions (rid, monitor_rid, status, trigger_data, effect_results, started_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING *`,
      values: [
        rid,
        monitorRid,
        "RUNNING",
        triggerData ? JSON.stringify(triggerData) : null,
        JSON.stringify([]),
      ],
    });

    return rowToExecution(rows[0]);
  }

  async completeExecution(
    rid: string,
    effectResults: EffectResult[],
  ): Promise<MonitorExecution> {
    const { rows } = await this.pool.query<ExecutionRow>({
      text: `UPDATE monitor_executions
             SET status = $1, effect_results = $2, completed_at = NOW()
             WHERE rid = $3
             RETURNING *`,
      values: ["SUCCESS", JSON.stringify(effectResults), rid],
    });

    if (rows.length === 0) {
      throw notFound("MonitorExecution", rid);
    }
    return rowToExecution(rows[0]);
  }

  async failExecution(rid: string, error: string): Promise<MonitorExecution> {
    const { rows } = await this.pool.query<ExecutionRow>({
      text: `UPDATE monitor_executions
             SET status = $1, error = $2, completed_at = NOW()
             WHERE rid = $3
             RETURNING *`,
      values: ["FAILURE", error, rid],
    });

    if (rows.length === 0) {
      throw notFound("MonitorExecution", rid);
    }
    return rowToExecution(rows[0]);
  }

  async getExecution(rid: string): Promise<MonitorExecution> {
    const { rows } = await this.pool.query<ExecutionRow>({
      text: `SELECT * FROM monitor_executions WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("MonitorExecution", rid);
    }
    return rowToExecution(rows[0]);
  }

  async listExecutions(monitorRid?: string): Promise<MonitorExecution[]> {
    if (monitorRid) {
      const { rows } = await this.pool.query<ExecutionRow>({
        text: `SELECT * FROM monitor_executions WHERE monitor_rid = $1 ORDER BY started_at ASC`,
        values: [monitorRid],
      });
      return rows.map(rowToExecution);
    }

    const { rows } = await this.pool.query<ExecutionRow>({
      text: `SELECT * FROM monitor_executions ORDER BY started_at ASC`,
    });
    return rows.map(rowToExecution);
  }
}
