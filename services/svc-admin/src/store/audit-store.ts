// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single row of the `audit_log` table, in wire shape. */
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resourceType: string;
  resourceRid: string;
  details?: string;
}

/** Filters and paging window for an audit log query. */
export interface AuditQuery {
  /** Match the action verb, e.g. "CREATE".  Also matches "object.create". */
  action?: string;
  /** Match the acting principal (`user_rid`). */
  user?: string;
  /** Inclusive lower bound on `timestamp`, ISO-8601 or `YYYY-MM-DD`. */
  dateFrom?: string;
  /** Inclusive upper bound on `timestamp`, ISO-8601 or `YYYY-MM-DD`. */
  dateTo?: string;
  /** Zero-based offset into the (timestamp-descending) result set. */
  offset: number;
  /** Maximum number of rows to return. */
  limit: number;
}

/**
 * Read access to the audit trail.
 *
 * Entries are written by `writeAuditLog` / `AuditLogger` in `@openfoundry/db`;
 * this store only reads them back for the console's Audit Log screen.
 */
export interface AuditStore {
  /**
   * Whether this deployment can hold audit entries at all.
   *
   * False without a database: nothing writes entries in that mode, so an
   * empty result means the trail is unavailable rather than uneventful.
   */
  readonly available: boolean;

  /**
   * Return entries newest first, applying `query`'s filters.
   *
   * Implementations should return up to `limit` rows; the caller asks for one
   * more than the page size to detect whether a further page exists.
   */
  listEntries(query: AuditQuery): Promise<AuditLogEntry[]>;
}

// ---------------------------------------------------------------------------
// MemoryAuditStore
// ---------------------------------------------------------------------------

/**
 * Audit store used when the service runs without a database.
 *
 * Nothing writes audit entries in that mode (`writeAuditLog` needs a pool),
 * so this store is empty by construction and reports itself unavailable, which
 * is what lets the Audit Log screen say why it has nothing to show.
 */
export class MemoryAuditStore implements AuditStore {
  readonly available = false;

  async listEntries(): Promise<AuditLogEntry[]> {
    return [];
  }
}
