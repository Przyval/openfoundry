import pg from "pg";

// ---------------------------------------------------------------------------
// PgStore — generic JSONB-backed store that mirrors the in-memory Map stores
// ---------------------------------------------------------------------------

/**
 * A generic PostgreSQL store that can replace any in-memory `Map<string, T>`
 * store.  Each row has a TEXT primary key (`rid` by default) and a JSONB
 * `data` column that holds the full entity payload.
 *
 * This is intentionally simple: it stores domain objects as opaque JSONB and
 * queries by primary key or simple column filters.  For tables that already
 * have a rich relational schema (e.g. ontologies, objects), use the dedicated
 * `PgOntologyStore` / `PgObjectStore` instead.
 *
 * Designed for tables that follow the pattern:
 *
 * ```sql
 * CREATE TABLE <tableName> (
 *   <pkColumn> TEXT PRIMARY KEY,
 *   data JSONB NOT NULL,
 *   ...extra columns for indexing / filtering
 * );
 * ```
 */
export class PgStore<T = unknown> {
  constructor(
    private pool: pg.Pool,
    private tableName: string,
    private pkColumn: string = "rid",
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  /**
   * Return all rows, optionally filtered by column equality conditions.
   */
  async getAll(filter?: Record<string, string>): Promise<T[]> {
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

    const { rows } = await this.pool.query<{ data: T } & Record<string, unknown>>(text, values);
    return rows.map((r) => (r.data !== undefined ? r.data : r) as T);
  }

  /**
   * Return a single row by primary key, or `null` if it does not exist.
   */
  async getById(id: string): Promise<T | null> {
    const { rows } = await this.pool.query<{ data: T } & Record<string, unknown>>(
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

    await this.pool.query(
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

    const result = await this.pool.query(
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

    await this.pool.query(
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
    const result = await this.pool.query(
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

    const { rows } = await this.pool.query<{ total: number }>(text, values);
    return rows[0].total;
  }

  /**
   * Check if a row exists by primary key.
   */
  async exists(id: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE ${this.pkColumn} = $1) AS exists`,
      [id],
    );
    return rows[0].exists;
  }

  /**
   * Raw query escape hatch.
   */
  async query<R = unknown>(text: string, values?: unknown[]): Promise<R[]> {
    const { rows } = await this.pool.query<R & pg.QueryResultRow>(text, values);
    return rows;
  }
}
