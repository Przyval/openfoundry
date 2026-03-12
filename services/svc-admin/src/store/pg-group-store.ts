import type pg from "pg";
import { sql } from "@openfoundry/db";
import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";
import type { StoredGroup, CreateGroupInput } from "./group-store.js";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface GroupRow {
  rid: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToStoredGroup(row: GroupRow, members: Set<string>): StoredGroup {
  return {
    rid: row.rid,
    name: row.name,
    description: row.description ?? undefined,
    members,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// PgGroupStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed group store.  Uses parameterised queries exclusively.
 */
export class PgGroupStore {
  constructor(private pool: pg.Pool) {}

  async createGroup(input: CreateGroupInput): Promise<StoredGroup> {
    const rid = generateRid("multipass", "group").toString();

    try {
      const { rows } = await this.pool.query<GroupRow>({
        text: `INSERT INTO groups (rid, name, description)
               VALUES ($1, $2, $3)
               RETURNING *`,
        values: [rid, input.name, input.description ?? null],
      });
      return rowToStoredGroup(rows[0], new Set());
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict("Group", `name "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async getGroup(rid: string): Promise<StoredGroup> {
    const q = sql()
      .select("*")
      .from("groups")
      .where("rid = ?", rid);

    const { rows } = await this.pool.query<GroupRow>(q.build());
    if (rows.length === 0) {
      throw notFound("Group", rid);
    }

    const members = await this.fetchMembers(rid);
    return rowToStoredGroup(rows[0], members);
  }

  async listGroups(
    pageSize = 100,
    offset = 0,
  ): Promise<{ items: StoredGroup[]; total: number }> {
    const countResult = await this.pool.query<{ total: number }>({
      text: "SELECT COUNT(*)::int AS total FROM groups",
      values: [],
    });

    const q = sql()
      .select("*")
      .from("groups")
      .orderBy("created_at", "ASC")
      .limit(pageSize)
      .offset(offset);

    const { rows } = await this.pool.query<GroupRow>(q.build());

    const items: StoredGroup[] = [];
    for (const row of rows) {
      const members = await this.fetchMembers(row.rid);
      items.push(rowToStoredGroup(row, members));
    }

    return { items, total: countResult.rows[0].total };
  }

  async deleteGroup(rid: string): Promise<void> {
    const q = sql()
      .deleteFrom("groups")
      .where("rid = ?", rid);

    const result = await this.pool.query(q.build());
    if (result.rowCount === 0) {
      throw notFound("Group", rid);
    }
  }

  async addMember(groupRid: string, userRid: string): Promise<void> {
    // Verify group exists
    await this.getGroup(groupRid);

    try {
      await this.pool.query({
        text: `INSERT INTO group_members (group_rid, user_rid, role)
               VALUES ($1, $2, 'MEMBER')`,
        values: [groupRid, userRid],
      });
    } catch (err: unknown) {
      if (isPgUniqueViolation(err)) {
        throw conflict(
          "GroupMember",
          `user "${userRid}" is already a member of group "${groupRid}"`,
        );
      }
      throw err;
    }
  }

  async removeMember(groupRid: string, userRid: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM group_members WHERE group_rid = $1 AND user_rid = $2`,
      values: [groupRid, userRid],
    });
    if (result.rowCount === 0) {
      throw notFound("GroupMember", userRid);
    }
  }

  async getMembers(groupRid: string): Promise<string[]> {
    // Verify group exists
    await this.getGroup(groupRid);
    const members = await this.fetchMembers(groupRid);
    return Array.from(members);
  }

  async getGroupsForUser(userRid: string): Promise<StoredGroup[]> {
    const { rows: memberRows } = await this.pool.query<{ group_rid: string }>({
      text: `SELECT group_rid FROM group_members WHERE user_rid = $1`,
      values: [userRid],
    });

    const groups: StoredGroup[] = [];
    for (const mr of memberRows) {
      groups.push(await this.getGroup(mr.group_rid));
    }
    return groups;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async fetchMembers(groupRid: string): Promise<Set<string>> {
    const { rows } = await this.pool.query<{ user_rid: string }>({
      text: `SELECT user_rid FROM group_members WHERE group_rid = $1`,
      values: [groupRid],
    });
    return new Set(rows.map((r) => r.user_rid));
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
