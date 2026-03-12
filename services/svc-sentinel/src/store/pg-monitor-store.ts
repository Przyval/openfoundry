import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type {
  StoredMonitor,
  CreateMonitorInput,
  UpdateMonitorInput,
  TriggerDef,
  EffectDef,
} from "./monitor-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface MonitorRow {
  rid: string;
  name: string;
  description: string | null;
  object_type: string;
  trigger: TriggerDef;
  effects: EffectDef[];
  status: string;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToMonitor(row: MonitorRow): StoredMonitor {
  return {
    rid: row.rid,
    name: row.name,
    description: row.description ?? undefined,
    objectType: row.object_type,
    trigger: row.trigger,
    effects: row.effects ?? [],
    status: row.status as StoredMonitor["status"],
    lastTriggeredAt: row.last_triggered_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
// PgMonitorStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed monitor store for Sentinel.
 */
export class PgMonitorStore {
  constructor(private pool: pg.Pool) {}

  async createMonitor(input: CreateMonitorInput): Promise<StoredMonitor> {
    const rid = generateRid("sentinel", "monitor").toString();

    try {
      const { rows } = await this.pool.query<MonitorRow>({
        text: `INSERT INTO monitors (rid, name, description, object_type, trigger, effects, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING *`,
        values: [
          rid,
          input.name,
          input.description ?? null,
          input.objectType,
          JSON.stringify(input.trigger),
          JSON.stringify(input.effects),
          "ACTIVE",
        ],
      });

      return rowToMonitor(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Monitor", `name "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async getMonitor(rid: string): Promise<StoredMonitor> {
    const { rows } = await this.pool.query<MonitorRow>({
      text: `SELECT * FROM monitors WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Monitor", rid);
    }
    return rowToMonitor(rows[0]);
  }

  async listMonitors(): Promise<StoredMonitor[]> {
    const { rows } = await this.pool.query<MonitorRow>({
      text: `SELECT * FROM monitors ORDER BY created_at ASC`,
    });

    return rows.map(rowToMonitor);
  }

  async updateMonitor(rid: string, input: UpdateMonitorInput): Promise<StoredMonitor> {
    // Verify it exists first
    await this.getMonitor(rid);

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 0;

    if (input.name !== undefined) {
      idx++;
      sets.push(`name = $${idx}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      idx++;
      sets.push(`description = $${idx}`);
      values.push(input.description);
    }
    if (input.objectType !== undefined) {
      idx++;
      sets.push(`object_type = $${idx}`);
      values.push(input.objectType);
    }
    if (input.trigger !== undefined) {
      idx++;
      sets.push(`trigger = $${idx}`);
      values.push(JSON.stringify(input.trigger));
    }
    if (input.effects !== undefined) {
      idx++;
      sets.push(`effects = $${idx}`);
      values.push(JSON.stringify(input.effects));
    }
    if (input.status !== undefined) {
      idx++;
      sets.push(`status = $${idx}`);
      values.push(input.status);
    }

    sets.push(`updated_at = NOW()`);

    idx++;
    values.push(rid);

    const { rows } = await this.pool.query<MonitorRow>({
      text: `UPDATE monitors SET ${sets.join(", ")} WHERE rid = $${idx} RETURNING *`,
      values,
    });

    if (rows.length === 0) {
      throw notFound("Monitor", rid);
    }
    return rowToMonitor(rows[0]);
  }

  async deleteMonitor(rid: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM monitors WHERE rid = $1`,
      values: [rid],
    });

    if (result.rowCount === 0) {
      throw notFound("Monitor", rid);
    }
  }

  async triggerMonitor(rid: string): Promise<StoredMonitor> {
    const { rows } = await this.pool.query<MonitorRow>({
      text: `UPDATE monitors
             SET last_triggered_at = NOW(), updated_at = NOW()
             WHERE rid = $1
             RETURNING *`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Monitor", rid);
    }
    return rowToMonitor(rows[0]);
  }
}
