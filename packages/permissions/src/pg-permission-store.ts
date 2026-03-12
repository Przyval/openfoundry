import type { Pool } from "pg";
import type {
  Role,
  PermissionGrant,
} from "./permission-types.js";
import { Permission } from "./permission-types.js";

/**
 * PostgreSQL-backed permission store implementing the RBAC model.
 *
 * Queries the `permission_grants`, `roles`, and `role_assignments` tables
 * created by migration 003.
 */
export class PgPermissionStore {
  constructor(private readonly pool: Pool) {}

  // ---------------------------------------------------------------------------
  // Direct permission grants
  // ---------------------------------------------------------------------------

  /**
   * Check whether `subjectRid` has a specific `permission` on `resourceRid`.
   *
   * Returns true if there is either:
   * - An explicit grant for the exact permission, OR
   * - An explicit grant for ADMIN on the resource (which implies everything).
   */
  async hasPermission(
    subjectRid: string,
    resourceRid: string,
    permission: string,
  ): Promise<boolean> {
    const result = await this.pool.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM permission_grants
         WHERE subject_rid  = $1
           AND resource_rid = $2
           AND (permission = $3 OR permission = $4)
       ) AS found`,
      [subjectRid, resourceRid, permission, Permission.ADMIN],
    );
    return result.rows[0]?.found ?? false;
  }

  /**
   * Check whether `subjectRid` has `permission` via any of its assigned roles.
   *
   * Also returns true if any assigned role contains the 'admin' permission
   * (which implies all other permissions).
   */
  async hasRolePermission(
    subjectRid: string,
    permission: string,
  ): Promise<boolean> {
    const result = await this.pool.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM role_assignments ra
         JOIN roles r ON r.rid = ra.role_rid
         WHERE ra.subject_rid = $1
           AND ($2 = ANY(r.permissions) OR 'admin' = ANY(r.permissions))
       ) AS found`,
      [subjectRid, permission.toLowerCase()],
    );
    return result.rows[0]?.found ?? false;
  }

  /**
   * Grant a specific permission from one subject to a resource.
   */
  async grant(
    subjectRid: string,
    resourceRid: string,
    permission: string,
    grantedBy: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO permission_grants (subject_rid, resource_rid, permission, granted_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (subject_rid, resource_rid, permission) DO NOTHING`,
      [subjectRid, resourceRid, permission, grantedBy],
    );
  }

  /**
   * Revoke a specific permission.
   */
  async revoke(
    subjectRid: string,
    resourceRid: string,
    permission: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM permission_grants
       WHERE subject_rid  = $1
         AND resource_rid = $2
         AND permission   = $3`,
      [subjectRid, resourceRid, permission],
    );
  }

  /**
   * List all permission grants for a subject.
   */
  async listGrants(subjectRid: string): Promise<PermissionGrant[]> {
    const result = await this.pool.query<{
      subject_rid: string;
      resource_rid: string;
      permission: string;
      granted_by: string;
      granted_at: Date;
    }>(
      `SELECT subject_rid, resource_rid, permission, granted_by, granted_at
       FROM permission_grants
       WHERE subject_rid = $1
       ORDER BY granted_at`,
      [subjectRid],
    );

    return result.rows.map((row) => ({
      subjectRid: row.subject_rid,
      resourceRid: row.resource_rid,
      permission: row.permission as Permission,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
    }));
  }

  // ---------------------------------------------------------------------------
  // Role assignments
  // ---------------------------------------------------------------------------

  /**
   * Assign a role to a subject.
   */
  async assignRole(subjectRid: string, roleRid: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO role_assignments (subject_rid, role_rid)
       VALUES ($1, $2)
       ON CONFLICT (subject_rid, role_rid) DO NOTHING`,
      [subjectRid, roleRid],
    );
  }

  /**
   * Remove a role from a subject.
   */
  async removeRole(subjectRid: string, roleRid: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM role_assignments
       WHERE subject_rid = $1
         AND role_rid    = $2`,
      [subjectRid, roleRid],
    );
  }

  /**
   * List all roles assigned to a subject.
   */
  async listRoles(subjectRid: string): Promise<Role[]> {
    const result = await this.pool.query<{
      rid: string;
      name: string;
      permissions: string[];
      description: string | null;
    }>(
      `SELECT r.rid, r.name, r.permissions, r.description
       FROM roles r
       JOIN role_assignments ra ON ra.role_rid = r.rid
       WHERE ra.subject_rid = $1
       ORDER BY r.name`,
      [subjectRid],
    );

    return result.rows.map((row) => ({
      rid: row.rid,
      name: row.name,
      permissions: row.permissions.map((p) => p.toUpperCase() as Permission),
      description: row.description ?? undefined,
    }));
  }

  // ---------------------------------------------------------------------------
  // Role management
  // ---------------------------------------------------------------------------

  /**
   * List all defined roles.
   */
  async listAllRoles(): Promise<Role[]> {
    const result = await this.pool.query<{
      rid: string;
      name: string;
      permissions: string[];
      description: string | null;
    }>(
      `SELECT rid, name, permissions, description
       FROM roles
       ORDER BY name`,
    );

    return result.rows.map((row) => ({
      rid: row.rid,
      name: row.name,
      permissions: row.permissions.map((p) => p.toUpperCase() as Permission),
      description: row.description ?? undefined,
    }));
  }

  /**
   * Get a single role by its RID.
   */
  async getRole(rid: string): Promise<Role | null> {
    const result = await this.pool.query<{
      rid: string;
      name: string;
      permissions: string[];
      description: string | null;
    }>(
      `SELECT rid, name, permissions, description
       FROM roles
       WHERE rid = $1`,
      [rid],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      rid: row.rid,
      name: row.name,
      permissions: row.permissions.map((p) => p.toUpperCase() as Permission),
      description: row.description ?? undefined,
    };
  }

  /**
   * Create a new role.
   */
  async createRole(role: {
    rid: string;
    name: string;
    permissions: string[];
    description?: string;
  }): Promise<Role> {
    await this.pool.query(
      `INSERT INTO roles (rid, name, permissions, description)
       VALUES ($1, $2, $3, $4)`,
      [
        role.rid,
        role.name,
        role.permissions.map((p) => p.toLowerCase()),
        role.description ?? null,
      ],
    );

    return {
      rid: role.rid,
      name: role.name,
      permissions: role.permissions.map((p) => p.toUpperCase() as Permission),
      description: role.description,
    };
  }

  /**
   * Delete a role by its RID.
   * Returns true if a row was actually deleted.
   */
  async deleteRole(rid: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM roles WHERE rid = $1`,
      [rid],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * List all subjects assigned to a given role.
   */
  async listRoleAssignments(roleRid: string): Promise<string[]> {
    const result = await this.pool.query<{ subject_rid: string }>(
      `SELECT subject_rid FROM role_assignments WHERE role_rid = $1 ORDER BY subject_rid`,
      [roleRid],
    );
    return result.rows.map((r) => r.subject_rid);
  }

  /**
   * Check if a subject holds the platform-admin role.
   */
  async isPlatformAdmin(subjectRid: string): Promise<boolean> {
    const result = await this.pool.query<{ found: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM role_assignments ra
         JOIN roles r ON r.rid = ra.role_rid
         WHERE ra.subject_rid = $1
           AND r.name = 'platform-admin'
       ) AS found`,
      [subjectRid],
    );
    return result.rows[0]?.found ?? false;
  }
}
