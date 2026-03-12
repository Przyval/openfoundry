import pg from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  /** The user performing the action. */
  userRid?: string;
  /** Action identifier (e.g. CREATE, READ, UPDATE, DELETE). */
  action: string;
  /** RID of the resource being acted upon. */
  resourceRid?: string;
  /** Type of resource (e.g. OBJECT, DATASET, ONTOLOGY). */
  resourceType?: string;
  /** Arbitrary structured details about the action. */
  details?: Record<string, unknown>;
  /** IP address of the caller. */
  ipAddress?: string;
  /** User-Agent header of the caller. */
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// AuditLogger
// ---------------------------------------------------------------------------

/**
 * Lightweight audit logger that writes entries to the `audit_log` table.
 *
 * Designed for fire-and-forget usage: callers should **not** await the
 * returned promise in the request hot-path.  Errors are caught and logged
 * to stderr so they never bubble up to the caller.
 */
export class AuditLogger {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  /**
   * Insert an audit log entry.
   *
   * Usage (fire-and-forget):
   * ```ts
   * audit.log({ action: "CREATE", resourceRid: rid, userRid });
   * ```
   */
  log(entry: AuditEntry): void {
    this.pool
      .query(
        `INSERT INTO audit_log (user_rid, action, resource_rid, resource_type, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.userRid ?? null,
          entry.action,
          entry.resourceRid ?? null,
          entry.resourceType ?? null,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
        ],
      )
      .catch((err: unknown) => {
        // Fire-and-forget: never let audit failures propagate.
        console.error("[AuditLogger] failed to write audit entry:", err);
      });
  }
}
