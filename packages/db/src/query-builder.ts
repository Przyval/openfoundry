// ---------------------------------------------------------------------------
// Query builder — thin, safe wrapper around parameterised SQL
// ---------------------------------------------------------------------------

export interface QueryConfig {
  text: string;
  values: unknown[];
}

/**
 * A simple, composable query builder that produces parameterised SQL.
 *
 * This is explicitly *not* an ORM — it produces `{ text, values }` pairs that
 * can be passed directly to `pg.Pool.query()`.
 */
export class QueryBuilder {
  private parts: string[] = [];
  private values: unknown[] = [];
  private paramIndex = 0;

  // -------------------------------------------------------------------------
  // SELECT / FROM
  // -------------------------------------------------------------------------

  select(columns: string | string[]): this {
    const cols = Array.isArray(columns) ? columns.join(", ") : columns;
    this.parts.push(`SELECT ${cols}`);
    return this;
  }

  from(table: string): this {
    this.parts.push(`FROM ${table}`);
    return this;
  }

  // -------------------------------------------------------------------------
  // WHERE clauses
  // -------------------------------------------------------------------------

  where(condition: string, ...vals: unknown[]): this {
    const replaced = this.replaceParams(condition, vals);
    this.parts.push(`WHERE ${replaced}`);
    return this;
  }

  andWhere(condition: string, ...vals: unknown[]): this {
    const replaced = this.replaceParams(condition, vals);
    this.parts.push(`AND ${replaced}`);
    return this;
  }

  orWhere(condition: string, ...vals: unknown[]): this {
    const replaced = this.replaceParams(condition, vals);
    this.parts.push(`OR ${replaced}`);
    return this;
  }

  // -------------------------------------------------------------------------
  // ORDER BY / LIMIT / OFFSET
  // -------------------------------------------------------------------------

  orderBy(column: string, direction: "ASC" | "DESC" = "ASC"): this {
    this.parts.push(`ORDER BY ${column} ${direction}`);
    return this;
  }

  limit(n: number): this {
    this.paramIndex++;
    this.values.push(n);
    this.parts.push(`LIMIT $${this.paramIndex}`);
    return this;
  }

  offset(n: number): this {
    this.paramIndex++;
    this.values.push(n);
    this.parts.push(`OFFSET $${this.paramIndex}`);
    return this;
  }

  returning(columns: string | string[] = "*"): this {
    const cols = Array.isArray(columns) ? columns.join(", ") : columns;
    this.parts.push(`RETURNING ${cols}`);
    return this;
  }

  // -------------------------------------------------------------------------
  // INSERT
  // -------------------------------------------------------------------------

  insertInto(table: string, data: Record<string, unknown>): this {
    const keys = Object.keys(data);
    const placeholders: string[] = [];
    for (const key of keys) {
      this.paramIndex++;
      this.values.push(data[key]);
      placeholders.push(`$${this.paramIndex}`);
    }
    this.parts.push(
      `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders.join(", ")})`,
    );
    return this;
  }

  // -------------------------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------------------------

  update(table: string, data: Record<string, unknown>): this {
    const setClauses: string[] = [];
    for (const key of Object.keys(data)) {
      this.paramIndex++;
      this.values.push(data[key]);
      setClauses.push(`${key} = $${this.paramIndex}`);
    }
    this.parts.push(`UPDATE ${table} SET ${setClauses.join(", ")}`);
    return this;
  }

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------

  deleteFrom(table: string): this {
    this.parts.push(`DELETE FROM ${table}`);
    return this;
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  build(): QueryConfig {
    return {
      text: this.parts.join(" "),
      values: [...this.values],
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Replace `?` placeholders in `condition` with numbered `$N` params and
   * push values into the internal array.
   */
  private replaceParams(condition: string, vals: unknown[]): string {
    let idx = 0;
    return condition.replace(/\?/g, () => {
      this.paramIndex++;
      this.values.push(vals[idx++]);
      return `$${this.paramIndex}`;
    });
  }
}

/**
 * Convenience factory — `sql("users")` returns a fresh `QueryBuilder` (does
 * *not* pre-populate FROM; the caller chains `.select().from()` etc.).
 */
export function sql(_table?: string): QueryBuilder {
  return new QueryBuilder();
}
