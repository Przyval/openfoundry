import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import type { UserDirectory, UserRecord } from "./user-store.js";

/**
 * The `users` table as svc-multipass reads and writes it.
 *
 * svc-admin owns the profile columns of the same rows; this store owns the ones
 * that decide what a login yields - `password_hash`, `platform_roles`,
 * `group_ids` and `marking_ids` - and reads the rest. A user svc-admin created has no password until an operator
 * sets one (src/cli/users.ts), and until then cannot log in.
 *
 * Login is pre-tenant: the username is all there is to look the row up by.
 * The `users` row-level-security policy (db/migrations/009_multi_tenancy.sql)
 * hides rows of other organizations from a connection that has not set
 * `app.org_rid`, and rejects writes from it. The table is `FORCE ROW LEVEL
 * SECURITY`, so even its owner is subject to that; this store needs a superuser
 * or a `BYPASSRLS` role, as deploy/ connects with.
 */

interface UserRow {
  username: string;
  display_name: string | null;
  password_hash: string | null;
  platform_roles: string[] | null;
  org_rid: string | null;
  group_ids: string[] | null;
  marking_ids: string[] | null;
  is_active: boolean;
}

const COLUMNS =
  "username, display_name, password_hash, platform_roles, org_rid, group_ids, marking_ids, is_active";

function toRecord(row: UserRow): UserRecord {
  return {
    username: row.username,
    displayName: row.display_name ?? row.username,
    passwordHash: row.password_hash,
    roles: row.platform_roles ?? [],
    orgRid: row.org_rid,
    groups: row.group_ids ?? [],
    markings: row.marking_ids ?? [],
    active: row.is_active,
  };
}

export interface NewUser {
  readonly username: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly roles: readonly string[];
  readonly orgRid: string | null;
  readonly groups: readonly string[];
  readonly markings: readonly string[];
}

export class UserAlreadyExistsError extends Error {
  constructor(username: string) {
    super(`user "${username}" already exists`);
    this.name = "UserAlreadyExistsError";
  }
}

export class PgUserStore implements UserDirectory {
  constructor(private readonly pool: pg.Pool) {}

  async findByUsername(username: string): Promise<UserRecord | undefined> {
    const { rows } = await this.pool.query<UserRow>({
      text: `SELECT ${COLUMNS} FROM users WHERE username = $1`,
      values: [username],
    });
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async createUser(user: NewUser): Promise<UserRecord> {
    try {
      const { rows } = await this.pool.query<UserRow>({
        text: `INSERT INTO users (rid, username, display_name, password_hash, platform_roles, org_rid,
                                  group_ids, marking_ids, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
               RETURNING ${COLUMNS}`,
        values: [
          generateRid("multipass", "user").toString(),
          user.username,
          user.displayName,
          user.passwordHash,
          user.roles,
          user.orgRid,
          user.groups,
          user.markings,
        ],
      });
      return toRecord(rows[0]!);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new UserAlreadyExistsError(user.username);
      }
      throw err;
    }
  }

  /** @returns false when no such user exists. */
  async setPassword(username: string, passwordHash: string): Promise<boolean> {
    const result = await this.pool.query({
      text: "UPDATE users SET password_hash = $2 WHERE username = $1",
      values: [username, passwordHash],
    });
    return (result.rowCount ?? 0) > 0;
  }

  /** @returns false when no such user exists. */
  async setRoles(username: string, roles: readonly string[]): Promise<boolean> {
    return this.setList("platform_roles", username, roles);
  }

  /** @returns false when no such user exists. */
  async setGroups(username: string, groups: readonly string[]): Promise<boolean> {
    return this.setList("group_ids", username, groups);
  }

  /** @returns false when no such user exists. */
  async setMarkings(username: string, markings: readonly string[]): Promise<boolean> {
    return this.setList("marking_ids", username, markings);
  }

  private async setList(
    column: "platform_roles" | "group_ids" | "marking_ids",
    username: string,
    values: readonly string[],
  ): Promise<boolean> {
    const result = await this.pool.query({
      text: `UPDATE users SET ${column} = $2 WHERE username = $1`,
      values: [username, values],
    });
    return (result.rowCount ?? 0) > 0;
  }
}
