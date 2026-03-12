import type pg from "pg";
import { sql } from "@openfoundry/db";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type {
  StoredUser,
  UserStatus,
  CreateUserInput,
  UpdateUserInput,
} from "./user-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface UserRow {
  rid: string;
  username: string;
  email: string;
  display_name: string;
  metadata: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusFromRow(row: UserRow): UserStatus {
  return row.is_active ? "ACTIVE" : "INACTIVE";
}

function rowToStoredUser(row: UserRow): StoredUser {
  return {
    rid: row.rid,
    username: row.username,
    email: row.email ?? "",
    displayName: row.display_name ?? "",
    attributes: row.metadata ?? {},
    status: statusFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// PgUserStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed user store.  Uses parameterised queries exclusively.
 */
export class PgUserStore {
  constructor(private pool: pg.Pool) {}

  async createUser(input: CreateUserInput): Promise<StoredUser> {
    const rid = generateRid("multipass", "user").toString();

    try {
      const { rows } = await this.pool.query<UserRow>({
        text: `INSERT INTO users (rid, username, email, display_name, metadata, is_active)
               VALUES ($1, $2, $3, $4, $5, TRUE)
               RETURNING *`,
        values: [
          rid,
          input.username,
          input.email,
          input.displayName,
          JSON.stringify(input.attributes ?? {}),
        ],
      });
      return rowToStoredUser(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        const msg = pgConstraintMessage(err);
        if (msg.includes("username")) {
          throw conflict("User", `username "${input.username}" already exists`);
        }
        if (msg.includes("email")) {
          throw conflict("User", `email "${input.email}" already exists`);
        }
        throw conflict("User", "duplicate key");
      }
      throw err;
    }
  }

  async getUser(rid: string): Promise<StoredUser> {
    const q = sql()
      .select("*")
      .from("users")
      .where("rid = ?", rid);

    const { rows } = await this.pool.query<UserRow>(q.build());
    if (rows.length === 0) {
      throw notFound("User", rid);
    }
    return rowToStoredUser(rows[0]);
  }

  async getUserByUsername(username: string): Promise<StoredUser> {
    const q = sql()
      .select("*")
      .from("users")
      .where("username = ?", username);

    const { rows } = await this.pool.query<UserRow>(q.build());
    if (rows.length === 0) {
      throw notFound("User", username);
    }
    return rowToStoredUser(rows[0]);
  }

  async listUsers(
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: StoredUser[]; total: number }> {
    const countResult = await this.pool.query<{ total: number }>({
      text: "SELECT COUNT(*)::int AS total FROM users",
      values: [],
    });

    const q = sql()
      .select("*")
      .from("users")
      .orderBy("created_at", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<UserRow>(q.build());
    return {
      items: rows.map(rowToStoredUser),
      total: countResult.rows[0].total,
    };
  }

  async updateUser(rid: string, input: UpdateUserInput): Promise<StoredUser> {
    const data: Record<string, unknown> = {};
    if (input.email !== undefined) data.email = input.email;
    if (input.displayName !== undefined) data.display_name = input.displayName;
    if (input.attributes !== undefined) data.metadata = JSON.stringify(input.attributes);
    if (input.status !== undefined) data.is_active = input.status === "ACTIVE";

    if (Object.keys(data).length === 0) {
      return this.getUser(rid);
    }

    const q = sql()
      .update("users", data)
      .where("rid = ?", rid)
      .returning();

    try {
      const { rows } = await this.pool.query<UserRow>(q.build());
      if (rows.length === 0) {
        throw notFound("User", rid);
      }
      return rowToStoredUser(rows[0]);
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        if (input.email !== undefined) {
          throw conflict("User", `email "${input.email}" already exists`);
        }
        throw conflict("User", "duplicate key");
      }
      throw err;
    }
  }

  async deleteUser(rid: string): Promise<StoredUser> {
    const q = sql()
      .update("users", { is_active: false })
      .where("rid = ?", rid)
      .returning();

    const { rows } = await this.pool.query<UserRow>(q.build());
    if (rows.length === 0) {
      throw notFound("User", rid);
    }
    return rowToStoredUser(rows[0]);
  }

  async searchUsers(query: string): Promise<StoredUser[]> {
    const pattern = `%${query}%`;
    const { rows } = await this.pool.query<UserRow>({
      text: `SELECT * FROM users
             WHERE username ILIKE $1
                OR email ILIKE $1
                OR display_name ILIKE $1
             ORDER BY username ASC`,
      values: [pattern],
    });
    return rows.map(rowToStoredUser);
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

function pgConstraintMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "detail" in err) {
    return String((err as { detail: string }).detail);
  }
  return "";
}
