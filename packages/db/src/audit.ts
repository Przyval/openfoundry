/**
 * Audit log writer — fire-and-forget INSERT into audit_log table.
 *
 * Call this after any write operation (create, update, delete).
 * Errors are swallowed so audit failures never break the main flow.
 */

import type pg from "pg";

export type AuditAction =
  | "object.create"
  | "object.update"
  | "object.delete"
  | "ontology.create"
  | "ontology.update"
  | "user.login"
  | "user.logout"
  | "permission.grant"
  | "permission.revoke"
  | "csv.import"
  | "sync.run";

export interface AuditEvent {
  userRid?: string;
  action: AuditAction;
  resourceRid?: string;
  resourceType?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export function writeAuditLog(pool: pg.Pool, event: AuditEvent): void {
  // Fire-and-forget: never await, never throw
  pool
    .query(
      `INSERT INTO audit_log (user_rid, action, resource_rid, resource_type, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
      [
        event.userRid ?? null,
        event.action,
        event.resourceRid ?? null,
        event.resourceType ?? null,
        event.details ? JSON.stringify(event.details) : null,
        event.ipAddress ?? null,
        event.userAgent ?? null,
      ],
    )
    .catch(() => {
      // Audit failure must never break the main request
    });
}
