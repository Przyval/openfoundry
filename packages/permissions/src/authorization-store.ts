import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Pool } from "pg";
import type { RoleId } from "./roles.js";

/** The platform root. Every resource inherits what is granted or restricted here. */
export const ROOT_RESOURCE = "ri.platform.main.root.root";

export type PrincipalType = "user" | "group";

/**
 * The `grantedBy` of a root grant svc-multipass made from a legacy role name
 * (EDITOR, VIEWER). svc-multipass takes back what it granted under this
 * mark; a grant made explicitly takes the mark off.
 */
export const LEGACY_ROLE_GRANT_SOURCE = "legacy-role-mapping";

/** A role held by one principal on one resource; inherited by the resource's contents. */
export interface RoleGrant {
  readonly resourceRid: string;
  readonly principalType: PrincipalType;
  readonly principalId: string;
  readonly roleId: RoleId;
  readonly grantedBy: string;
  readonly grantedAt: string;
}

/**
 * The mandatory controls on a resource. Both are conjunctive and inherited:
 * a caller must belong to every listed Organization on the way up, and hold
 * every Marking on it, whatever role they have.
 */
export interface ResourcePolicy {
  readonly resourceRid: string;
  readonly organizations: readonly string[];
  readonly markings: readonly string[];
}

export interface PrincipalRef {
  readonly principalType: PrincipalType;
  readonly principalId: string;
}

/** Where role grants and mandatory controls live. */
export interface AuthorizationStore {
  /** Grants on any of `resourceRids` held by any of `principals`. */
  grantsFor(resourceRids: readonly string[], principals: readonly PrincipalRef[]): Promise<RoleGrant[]>;
  listGrants(resourceRid: string): Promise<RoleGrant[]>;
  /** Idempotent: granting a role already held changes nothing. */
  addGrant(grant: RoleGrant): Promise<void>;
  removeGrant(resourceRid: string, principal: PrincipalRef, roleId: RoleId): Promise<boolean>;
  policiesFor(resourceRids: readonly string[]): Promise<ResourcePolicy[]>;
  /** Replaces the resource's policy; an empty policy removes it. */
  setPolicy(policy: ResourcePolicy): Promise<void>;
}

const grantKey = (g: { resourceRid: string; principalType: string; principalId: string; roleId: string }) =>
  JSON.stringify([g.resourceRid, g.principalType, g.principalId, g.roleId]);

// ---------------------------------------------------------------------------
// In-memory, optionally persisted to a file shared by every service
// ---------------------------------------------------------------------------

interface FileShape {
  formatVersion: 1;
  grants: RoleGrant[];
  policies: ResourcePolicy[];
}

/**
 * Grants and policies in memory, mirrored to one JSON file when given a path.
 *
 * The file is shared: svc-admin writes it and every other service reads it, so
 * a read re-loads whenever the file's mtime moved. With `null` nothing touches
 * disk - tests pass that, as the other file-backed stores do.
 */
export class FileAuthorizationStore implements AuthorizationStore {
  private grants = new Map<string, RoleGrant>();
  private policies = new Map<string, ResourcePolicy>();
  private loadedMtimeMs = -1;

  constructor(private readonly path: string | null = "/tmp/openfoundry-data/authorization.json") {}

  private refresh(): void {
    if (this.path === null) return;
    let mtimeMs: number;
    try {
      mtimeMs = statSync(this.path).mtimeMs;
    } catch {
      this.grants = new Map();
      this.policies = new Map();
      this.loadedMtimeMs = -1;
      return;
    }
    if (mtimeMs === this.loadedMtimeMs) return;
    const data = JSON.parse(readFileSync(this.path, "utf8")) as FileShape;
    this.grants = new Map(data.grants.map((g) => [grantKey(g), g]));
    this.policies = new Map(data.policies.map((p) => [p.resourceRid, p]));
    this.loadedMtimeMs = mtimeMs;
  }

  private persist(): void {
    if (this.path === null) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const data: FileShape = {
      formatVersion: 1,
      grants: [...this.grants.values()],
      policies: [...this.policies.values()],
    };
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, this.path);
    this.loadedMtimeMs = statSync(this.path).mtimeMs;
  }

  async grantsFor(resourceRids: readonly string[], principals: readonly PrincipalRef[]): Promise<RoleGrant[]> {
    this.refresh();
    const rids = new Set(resourceRids);
    const who = new Set(principals.map((p) => `${p.principalType}:${p.principalId}`));
    return [...this.grants.values()].filter(
      (g) => rids.has(g.resourceRid) && who.has(`${g.principalType}:${g.principalId}`),
    );
  }

  async listGrants(resourceRid: string): Promise<RoleGrant[]> {
    this.refresh();
    return [...this.grants.values()].filter((g) => g.resourceRid === resourceRid);
  }

  async addGrant(grant: RoleGrant): Promise<void> {
    this.refresh();
    if (this.grants.has(grantKey(grant))) return;
    this.grants.set(grantKey(grant), grant);
    this.persist();
  }

  async removeGrant(resourceRid: string, principal: PrincipalRef, roleId: RoleId): Promise<boolean> {
    this.refresh();
    const removed = this.grants.delete(grantKey({ resourceRid, ...principal, roleId }));
    if (removed) this.persist();
    return removed;
  }

  async policiesFor(resourceRids: readonly string[]): Promise<ResourcePolicy[]> {
    this.refresh();
    const out: ResourcePolicy[] = [];
    for (const rid of resourceRids) {
      const p = this.policies.get(rid);
      if (p) out.push(p);
    }
    return out;
  }

  async setPolicy(policy: ResourcePolicy): Promise<void> {
    this.refresh();
    if (policy.organizations.length === 0 && policy.markings.length === 0) {
      this.policies.delete(policy.resourceRid);
    } else {
      this.policies.set(policy.resourceRid, policy);
    }
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

/** Backed by `resource_role_grants` and `resource_policies` (db/migrations/014). */
export class PgAuthorizationStore implements AuthorizationStore {
  constructor(private readonly pool: Pool) {}

  async grantsFor(resourceRids: readonly string[], principals: readonly PrincipalRef[]): Promise<RoleGrant[]> {
    if (resourceRids.length === 0 || principals.length === 0) return [];
    const { rows } = await this.pool.query(
      `SELECT resource_rid, principal_type, principal_id, role_id, granted_by, granted_at
         FROM resource_role_grants
        WHERE resource_rid = ANY($1)
          AND (principal_type, principal_id) IN (SELECT * FROM unnest($2::text[], $3::text[]))`,
      [resourceRids, principals.map((p) => p.principalType), principals.map((p) => p.principalId)],
    );
    return rows.map(toGrant);
  }

  async listGrants(resourceRid: string): Promise<RoleGrant[]> {
    const { rows } = await this.pool.query(
      `SELECT resource_rid, principal_type, principal_id, role_id, granted_by, granted_at
         FROM resource_role_grants WHERE resource_rid = $1 ORDER BY granted_at, principal_id`,
      [resourceRid],
    );
    return rows.map(toGrant);
  }

  async addGrant(grant: RoleGrant): Promise<void> {
    await this.pool.query(
      `INSERT INTO resource_role_grants (resource_rid, principal_type, principal_id, role_id, granted_by, granted_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [grant.resourceRid, grant.principalType, grant.principalId, grant.roleId, grant.grantedBy, grant.grantedAt],
    );
  }

  async removeGrant(resourceRid: string, principal: PrincipalRef, roleId: RoleId): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM resource_role_grants
        WHERE resource_rid = $1 AND principal_type = $2 AND principal_id = $3 AND role_id = $4`,
      [resourceRid, principal.principalType, principal.principalId, roleId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async policiesFor(resourceRids: readonly string[]): Promise<ResourcePolicy[]> {
    if (resourceRids.length === 0) return [];
    const { rows } = await this.pool.query(
      `SELECT resource_rid, organizations, markings FROM resource_policies WHERE resource_rid = ANY($1)`,
      [resourceRids],
    );
    return rows.map((r) => ({
      resourceRid: r.resource_rid as string,
      organizations: r.organizations as string[],
      markings: r.markings as string[],
    }));
  }

  async setPolicy(policy: ResourcePolicy): Promise<void> {
    if (policy.organizations.length === 0 && policy.markings.length === 0) {
      await this.pool.query(`DELETE FROM resource_policies WHERE resource_rid = $1`, [policy.resourceRid]);
      return;
    }
    await this.pool.query(
      `INSERT INTO resource_policies (resource_rid, organizations, markings) VALUES ($1, $2, $3)
       ON CONFLICT (resource_rid) DO UPDATE SET organizations = EXCLUDED.organizations, markings = EXCLUDED.markings`,
      [policy.resourceRid, policy.organizations, policy.markings],
    );
  }
}

function toGrant(r: Record<string, unknown>): RoleGrant {
  const at = r.granted_at;
  return {
    resourceRid: r.resource_rid as string,
    principalType: r.principal_type as PrincipalType,
    principalId: r.principal_id as string,
    roleId: r.role_id as RoleId,
    grantedBy: (r.granted_by as string | null) ?? "system",
    grantedAt: at instanceof Date ? at.toISOString() : String(at),
  };
}

/** Postgres when a pool is given, otherwise the shared file store. */
export function createAuthorizationStore(pool?: Pool): AuthorizationStore {
  return pool ? new PgAuthorizationStore(pool) : new FileAuthorizationStore();
}
