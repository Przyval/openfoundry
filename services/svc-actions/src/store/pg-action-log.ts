import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import type { ActionExecution, ExecutionStatus } from "./action-log.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface ExecutionRow {
  rid: string;
  action_api_name: string;
  parameters: Record<string, unknown>;
  status: string;
  started_at: string;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToExecution(row: ExecutionRow): ActionExecution {
  return {
    rid: row.rid,
    actionApiName: row.action_api_name,
    parameters: row.parameters ?? {},
    status: row.status as ExecutionStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// PgActionLog
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed action execution log.
 */
export class PgActionLog {
  constructor(private pool: pg.Pool) {}

  async logStart(
    actionApiName: string,
    parameters: Record<string, unknown>,
  ): Promise<ActionExecution> {
    const rid = generateRid("actions", "execution").toString();

    const { rows } = await this.pool.query<ExecutionRow>({
      text: `INSERT INTO action_executions (rid, action_api_name, parameters, status, started_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING *`,
      values: [rid, actionApiName, JSON.stringify(parameters), "RUNNING"],
    });

    return rowToExecution(rows[0]);
  }

  async logComplete(rid: string, result?: Record<string, unknown>): Promise<void> {
    await this.pool.query({
      text: `UPDATE action_executions
             SET status = $1, completed_at = NOW(), result = $2
             WHERE rid = $3`,
      values: ["SUCCEEDED", result ? JSON.stringify(result) : null, rid],
    });
  }

  async logFailure(rid: string, error: string): Promise<void> {
    await this.pool.query({
      text: `UPDATE action_executions
             SET status = $1, completed_at = NOW(), error = $2
             WHERE rid = $3`,
      values: ["FAILED", error, rid],
    });
  }

  async getExecution(rid: string): Promise<ActionExecution | undefined> {
    const { rows } = await this.pool.query<ExecutionRow>({
      text: `SELECT * FROM action_executions WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) return undefined;
    return rowToExecution(rows[0]);
  }

  async listExecutions(
    actionApiName: string,
    options: { pageSize?: number; pageToken?: string } = {},
  ): Promise<{ data: ActionExecution[]; nextPageToken?: string }> {
    const { pageSize = 25, pageToken } = options;

    let whereClause = "action_api_name = $1";
    const values: unknown[] = [actionApiName];
    let paramIdx = 1;

    if (pageToken) {
      paramIdx++;
      whereClause += ` AND started_at > (SELECT started_at FROM action_executions WHERE rid = $${paramIdx})`;
      values.push(pageToken);
    }

    paramIdx++;
    values.push(pageSize + 1);

    const { rows } = await this.pool.query<ExecutionRow>({
      text: `SELECT * FROM action_executions
             WHERE ${whereClause}
             ORDER BY started_at ASC
             LIMIT $${paramIdx}`,
      values,
    });

    const hasMore = rows.length > pageSize;
    const slice = hasMore ? rows.slice(0, pageSize) : rows;
    const data = slice.map(rowToExecution);
    const nextPageToken = hasMore ? slice[slice.length - 1].rid : undefined;

    return { data, nextPageToken };
  }
}
