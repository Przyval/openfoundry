/**
 * RBAC middleware — checks permission_grants table for resource access.
 *
 * Permissions model:
 *   subject_rid  = user RID (from JWT claims.sub)
 *   resource_rid = ontology/object-type/dataset RID being accessed
 *   permission   = "READ" | "WRITE" | "DELETE" | "ADMIN"
 *
 * If no grants exist for a resource (new resource), access is allowed for
 * the resource owner (org admin). This prevents lockout on first use.
 *
 * Usage: attach as preHandler on specific routes that need fine-grained control.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type pg from "pg";
import { OpenFoundryApiError, ErrorCode } from "@openfoundry/errors";

export type Permission = "READ" | "WRITE" | "DELETE" | "ADMIN";

export interface RbacOptions {
  pool: pg.Pool;
  required: Permission;
  /** Extract resource RID from request. Defaults to params.ontologyRid */
  getResourceRid?: (req: FastifyRequest) => string | undefined;
}

export function requirePermission(opts: RbacOptions) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const claims = request.claims as Record<string, unknown> | undefined;

    // Dev mode: no JWT configured → allow all
    if (!claims) return;

    const userRid = typeof claims.sub === "string" ? claims.sub : undefined;
    if (!userRid) return;

    // Admins bypass all permission checks
    const roles = (claims.roles as string[] | undefined) ?? [];
    if (roles.includes("admin")) return;

    const resourceRid = opts.getResourceRid
      ? opts.getResourceRid(request)
      : (request.params as Record<string, string>).ontologyRid;

    if (!resourceRid) return; // No resource to check

    const { rows } = await opts.pool.query<{ permission: string }>(
      `SELECT permission FROM permission_grants
       WHERE subject_rid = $1 AND resource_rid = $2 AND permission = ANY($3)
       LIMIT 1`,
      [userRid, resourceRid, [opts.required, "ADMIN"]],
    );

    if (rows.length === 0) {
      throw new OpenFoundryApiError({
        errorCode: ErrorCode.CUSTOM_CLIENT,
        errorName: "PermissionDenied",
        message: `You do not have ${opts.required} permission on ${resourceRid}`,
        statusCode: 403,
      });
    }
  };
}

/**
 * Grant a permission programmatically (used by admin endpoints).
 */
export async function grantPermission(
  pool: pg.Pool,
  subjectRid: string,
  resourceRid: string,
  permission: Permission,
  grantedBy?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO permission_grants (subject_rid, resource_rid, permission, granted_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (subject_rid, resource_rid, permission) DO NOTHING`,
    [subjectRid, resourceRid, permission, grantedBy ?? null],
  );
}

/**
 * Revoke a permission.
 */
export async function revokePermission(
  pool: pg.Pool,
  subjectRid: string,
  resourceRid: string,
  permission: Permission,
): Promise<void> {
  await pool.query(
    `DELETE FROM permission_grants
     WHERE subject_rid = $1 AND resource_rid = $2 AND permission = $3`,
    [subjectRid, resourceRid, permission],
  );
}
