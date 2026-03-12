import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type {
  StoredFunction,
  CreateFunctionInput,
  UpdateFunctionInput,
  ParameterDef,
} from "./function-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface FunctionRow {
  rid: string;
  api_name: string;
  display_name: string;
  description: string;
  version: number;
  runtime: string;
  code: string;
  parameters: ParameterDef[];
  return_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToFunction(row: FunctionRow): StoredFunction {
  return {
    rid: row.rid,
    apiName: row.api_name,
    displayName: row.display_name,
    description: row.description ?? "",
    version: row.version,
    runtime: row.runtime as StoredFunction["runtime"],
    code: row.code,
    parameters: row.parameters ?? [],
    returnType: row.return_type ?? "unknown",
    status: row.status as StoredFunction["status"],
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
// PgFunctionStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed function store.
 */
export class PgFunctionStore {
  constructor(private pool: pg.Pool) {}

  async registerFunction(input: CreateFunctionInput): Promise<StoredFunction> {
    const rid = generateRid("functions", "function").toString();

    try {
      const { rows } = await this.pool.query<FunctionRow>({
        text: `INSERT INTO functions (rid, api_name, display_name, description, version, runtime, code, parameters, return_type, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               RETURNING *`,
        values: [
          rid,
          input.apiName,
          input.displayName,
          input.description,
          1,
          "TYPESCRIPT",
          input.code,
          JSON.stringify(input.parameters ?? []),
          input.returnType ?? "unknown",
          "ACTIVE",
        ],
      });

      return rowToFunction(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Function", `apiName "${input.apiName}" already exists`);
      }
      throw err;
    }
  }

  async getFunction(rid: string): Promise<StoredFunction> {
    const { rows } = await this.pool.query<FunctionRow>({
      text: `SELECT * FROM functions WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Function", rid);
    }
    return rowToFunction(rows[0]);
  }

  async getFunctionByName(apiName: string): Promise<StoredFunction> {
    const { rows } = await this.pool.query<FunctionRow>({
      text: `SELECT * FROM functions WHERE api_name = $1`,
      values: [apiName],
    });

    if (rows.length === 0) {
      throw notFound("Function", apiName);
    }
    return rowToFunction(rows[0]);
  }

  async listFunctions(): Promise<StoredFunction[]> {
    const { rows } = await this.pool.query<FunctionRow>({
      text: `SELECT * FROM functions ORDER BY api_name ASC`,
    });

    return rows.map(rowToFunction);
  }

  async updateFunction(rid: string, input: UpdateFunctionInput): Promise<StoredFunction> {
    // Verify it exists first
    await this.getFunction(rid);

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 0;

    if (input.displayName !== undefined) {
      idx++;
      sets.push(`display_name = $${idx}`);
      values.push(input.displayName);
    }
    if (input.description !== undefined) {
      idx++;
      sets.push(`description = $${idx}`);
      values.push(input.description);
    }
    if (input.code !== undefined) {
      idx++;
      sets.push(`code = $${idx}`);
      values.push(input.code);
    }
    if (input.parameters !== undefined) {
      idx++;
      sets.push(`parameters = $${idx}`);
      values.push(JSON.stringify(input.parameters));
    }
    if (input.returnType !== undefined) {
      idx++;
      sets.push(`return_type = $${idx}`);
      values.push(input.returnType);
    }
    if (input.status !== undefined) {
      idx++;
      sets.push(`status = $${idx}`);
      values.push(input.status);
    }

    // Always increment version and update timestamp
    sets.push(`version = version + 1`);
    sets.push(`updated_at = NOW()`);

    idx++;
    values.push(rid);

    const { rows } = await this.pool.query<FunctionRow>({
      text: `UPDATE functions SET ${sets.join(", ")} WHERE rid = $${idx} RETURNING *`,
      values,
    });

    if (rows.length === 0) {
      throw notFound("Function", rid);
    }
    return rowToFunction(rows[0]);
  }

  async deleteFunction(rid: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM functions WHERE rid = $1`,
      values: [rid],
    });

    if (result.rowCount === 0) {
      throw notFound("Function", rid);
    }
  }
}
