import type pg from "pg";

// ---------------------------------------------------------------------------
// PgStore — generic JSONB-backed store with tenant isolation via RLS
// ---------------------------------------------------------------------------

/** Default maximum rows returned by getAll() to prevent unbounded queries. */
const DEFAULT_LIMIT = 100;

/**
 * A generic PostgreSQL store that can replace any in-memory `Map<string, T>`
 * store.  Each row has a TEXT primary key (`rid` by default) and a JSONB
 * `data` column that holds the full entity payload.
 *
 * **Tenant isolation:** When `orgRid` is set (via `withOrg()`), every query
 * runs inside a transaction that sets `SET LOCAL app.org_rid = '<orgRid>'`.
 * This activates Postgres Row-Level Security (RLS) policies that filter rows
 * by the `org_rid` column.  Using `SET LOCAL` ensures the setting is scoped
 * to the transaction and never leaks across pooled connections.
 *
 * For tables that already have a rich relational schema (e.g. ontologies,
 * objects), use the dedicated `PgOntologyStore` / `PgObjectStore` instead.
 */
export class PgStore<T = unknown> {
  /** Current tenant context — undefined means unscoped (superuser / migration). */
  private orgRid: string | undefined;

  constructor(
    private pool: pg.Pool,
    private tableName: string,
    private pkColumn: string = "rid",
  ) {}

  /**
   * Return a shallow copy of this store scoped to a specific tenant.
   * All queries on the returned store will run inside a transaction with
   * `SET LOCAL app.org_rid` so Postgres RLS policies take effect.
   */
  withOrg(orgRid: string): PgStore<T> {
    const scoped = new PgStore<T>(this.pool, this.tableName, this.pkColumn);
    scoped.orgRid = orgRid;
    return scoped;
  }

  // -------------------------------------------------------------------------
  // Internal: tenant-aware query execution
  // -------------------------------------------------------------------------

  /**
   * Execute a query, optionally inside a tenant-scoped transaction.
   * When orgRid is set, wraps in BEGIN + SET LOCAL + query + COMMIT to
   * activate RLS policies without leaking tenant context across pooled
   * connections.
   */
  private async exec<R extends pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>> {
    if (!this.orgRid) {
      return this.pool.query<R>(text, values);
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.org_rid = $1", [this.orgRid]);
      const result = await client.query<R>(text, values);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* ignore rollback error */ }
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Return rows, optionally filtered by column equality conditions.
   * Results are capped at `limit` rows (default 100) to prevent unbounded
   * queries.  Pass `limit: 0` to disable the cap.
   */
  async getAll(
    filter?: Record<string, string>,
    options?: { limit?: number; offset?: number },
  ): Promise<T[]> {
    let text = `SELECT * FROM ${this.tableName}`;
    const values: unknown[] = [];

    if (filter && Object.keys(filter).length > 0) {
      const conditions: string[] = [];
      let idx = 0;
      for (const [col, val] of Object.entries(filter)) {
        idx++;
        conditions.push(`${col} = $${idx}`);
        values.push(val);
      }
      text += ` WHERE ${conditions.join(" AND ")}`;
    }

    text += ` ORDER BY created_at ASC`;

    const limit = options?.limit ?? DEFAULT_LIMIT;
    if (limit > 0) {
      values.push(limit);
      text += ` LIMIT $${values.length}`;
    }
    if (options?.offset && options.offset > 0) {
      values.push(options.offset);
      text += ` OFFSET $${values.length}`;
    }

    const { rows } = await this.exec<{ data: T } & Record<string, unknown>>(text, values);
    return rows.map((r) => (r.data !== undefined ? r.data : r) as T);
  }

  /**
   * Return a single row by primary key, or `null` if it does not exist.
   */
  async getById(id: string): Promise<T | null> {
    const { rows } = await this.exec<{ data: T } & Record<string, unknown>>(
      `SELECT * FROM ${this.tableName} WHERE ${this.pkColumn} = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return (row.data !== undefined ? row.data : row) as T;
  }

  // -------------------------------------------------------------------------
  // Write
  // -------------------------------------------------------------------------

  /**
   * Insert a new row.  The full entity is stored in the `data` JSONB column.
   * Additional top-level columns can be provided via `extraColumns`.
   */
  async create(
    id: string,
    data: T,
    extraColumns?: Record<string, unknown>,
  ): Promise<void> {
    const cols: string[] = [this.pkColumn, "data"];
    const vals: unknown[] = [id, JSON.stringify(data)];
    let idx = 2;

    if (extraColumns) {
      for (const [col, val] of Object.entries(extraColumns)) {
        idx++;
        cols.push(col);
        vals.push(val);
      }
    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");

    await this.exec(
      `INSERT INTO ${this.tableName} (${cols.join(", ")}) VALUES (${placeholders})`,
      vals,
    );
  }

  /**
   * Update the `data` JSONB column (full replacement) for a given primary key.
   * Optionally update extra columns as well.
   */
  async update(
    id: string,
    data: T,
    extraColumns?: Record<string, unknown>,
  ): Promise<void> {
    const setClauses: string[] = ["data = $1"];
    const vals: unknown[] = [JSON.stringify(data)];
    let idx = 1;

    if (extraColumns) {
      for (const [col, val] of Object.entries(extraColumns)) {
        idx++;
        setClauses.push(`${col} = $${idx}`);
        vals.push(val);
      }
    }

    idx++;
    vals.push(id);

    const result = await this.exec(
      `UPDATE ${this.tableName} SET ${setClauses.join(", ")} WHERE ${this.pkColumn} = $${idx}`,
      vals,
    );

    if (result.rowCount === 0) {
      throw new Error(`${this.tableName}: row with ${this.pkColumn}=${id} not found`);
    }
  }

  /**
   * Upsert — insert or update on conflict.
   */
  async upsert(
    id: string,
    data: T,
    extraColumns?: Record<string, unknown>,
  ): Promise<void> {
    const cols: string[] = [this.pkColumn, "data"];
    const vals: unknown[] = [id, JSON.stringify(data)];
    let idx = 2;

    if (extraColumns) {
      for (const [col, val] of Object.entries(extraColumns)) {
        idx++;
        cols.push(col);
        vals.push(val);
      }
    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");

    // Build ON CONFLICT update list (all columns except the PK)
    const updateCols = cols.filter((c) => c !== this.pkColumn);
    const updateSet = updateCols
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");

    await this.exec(
      `INSERT INTO ${this.tableName} (${cols.join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (${this.pkColumn}) DO UPDATE SET ${updateSet}`,
      vals,
    );
  }

  /**
   * Delete a row by primary key.
   */
  async delete(id: string): Promise<void> {
    const result = await this.exec(
      `DELETE FROM ${this.tableName} WHERE ${this.pkColumn} = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      throw new Error(`${this.tableName}: row with ${this.pkColumn}=${id} not found`);
    }
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Count rows, optionally filtered.
   */
  async count(filter?: Record<string, string>): Promise<number> {
    let text = `SELECT COUNT(*)::int AS total FROM ${this.tableName}`;
    const values: unknown[] = [];

    if (filter && Object.keys(filter).length > 0) {
      const conditions: string[] = [];
      let idx = 0;
      for (const [col, val] of Object.entries(filter)) {
        idx++;
        conditions.push(`${col} = $${idx}`);
        values.push(val);
      }
      text += ` WHERE ${conditions.join(" AND ")}`;
    }

    const { rows } = await this.exec<{ total: number }>(text, values);
    return rows[0].total;
  }

  /**
   * Check if a row exists by primary key.
   */
  async exists(id: string): Promise<boolean> {
    const { rows } = await this.exec<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE ${this.pkColumn} = $1) AS exists`,
      [id],
    );
    return rows[0].exists;
  }

  /**
   * Raw query escape hatch.
   */
  async query<R = unknown>(text: string, values?: unknown[]): Promise<R[]> {
    const { rows } = await this.exec<R & pg.QueryResultRow>(text, values);
    return rows;
  }
}
