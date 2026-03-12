import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { conflict } from "@openfoundry/errors";
import type { RegisteredAction, ParameterDef, ActionHandler } from "./action-registry.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface ActionRow {
  rid: string;
  api_name: string;
  display_name: string;
  parameters: Record<string, { type: string; required: boolean; description?: string }>;
  modified_entities: Record<string, unknown>;
  status: string;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToRegisteredAction(row: ActionRow): RegisteredAction {
  const params = new Map<string, ParameterDef>();
  if (row.parameters) {
    for (const [key, val] of Object.entries(row.parameters)) {
      params.set(key, {
        type: val.type as ParameterDef["type"],
        required: val.required,
        description: val.description,
      });
    }
  }

  return {
    apiName: row.api_name,
    displayName: row.display_name ?? row.api_name,
    parameters: params,
    modifiedEntities: (row.modified_entities ?? {}) as RegisteredAction["modifiedEntities"],
    status: row.status as RegisteredAction["status"],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parametersToJson(
  params: Map<string, ParameterDef>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of params) {
    result[key] = { type: val.type, required: val.required, description: val.description };
  }
  return result;
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
// PgActionRegistry
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed action registry.  Mirrors the ActionRegistry interface
 * but persists action type definitions in PostgreSQL.
 *
 * Note: Action handlers are runtime-only and cannot be persisted.  They are
 * kept in a local Map and must be re-attached after restart.
 */
export class PgActionRegistry {
  private readonly handlers = new Map<string, ActionHandler>();

  constructor(private pool: pg.Pool) {}

  async registerAction(action: RegisteredAction): Promise<void> {
    const rid = generateRid("actions", "action").toString();

    try {
      await this.pool.query({
        text: `INSERT INTO action_registry (rid, api_name, display_name, parameters, modified_entities, status)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (api_name) DO UPDATE SET
                 display_name = EXCLUDED.display_name,
                 parameters = EXCLUDED.parameters,
                 modified_entities = EXCLUDED.modified_entities,
                 status = EXCLUDED.status,
                 updated_at = NOW()`,
        values: [
          rid,
          action.apiName,
          action.displayName,
          JSON.stringify(parametersToJson(action.parameters)),
          JSON.stringify(action.modifiedEntities),
          action.status,
        ],
      });
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Action", `apiName "${action.apiName}" already exists`);
      }
      throw err;
    }

    if (action.handler) {
      this.handlers.set(action.apiName, action.handler);
    }
  }

  async getAction(apiName: string): Promise<RegisteredAction | undefined> {
    const { rows } = await this.pool.query<ActionRow>({
      text: `SELECT * FROM action_registry WHERE api_name = $1`,
      values: [apiName],
    });

    if (rows.length === 0) return undefined;

    const action = rowToRegisteredAction(rows[0]);
    const handler = this.handlers.get(apiName);
    if (handler) {
      action.handler = handler;
    }
    return action;
  }

  async listActions(): Promise<RegisteredAction[]> {
    const { rows } = await this.pool.query<ActionRow>({
      text: `SELECT * FROM action_registry ORDER BY api_name ASC`,
    });

    return rows.map((row) => {
      const action = rowToRegisteredAction(row);
      const handler = this.handlers.get(row.api_name);
      if (handler) {
        action.handler = handler;
      }
      return action;
    });
  }

  setHandler(apiName: string, handler: ActionHandler): boolean {
    this.handlers.set(apiName, handler);
    return true;
  }
}
