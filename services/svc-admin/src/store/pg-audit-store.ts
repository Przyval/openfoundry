import type pg from "pg";
import type { AuditLogEntry, AuditQuery, AuditStore } from "./audit-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface AuditRow {
  id: string;
  timestamp: Date | string;
  user_rid: string | null;
  action: string;
  resource_rid: string | null;
  resource_type: string | null;
  details: string | null;
}

function rowToEntry(row: AuditRow): AuditLogEntry {
  return {
    id: String(row.id),
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : String(row.timestamp),
    user: row.user_rid ?? "",
    action: row.action,
    resourceType: row.resource_type ?? "",
    resourceRid: row.resource_rid ?? "",
    ...(row.details !== null ? { details: row.details } : {}),
  };
}

/**
 * Neutralise LIKE metacharacters so a filter value is matched literally.
 *
 * The result is bound as a parameter; only the wildcards inside it are
 * escaped, using LIKE's default `\` escape character.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ---------------------------------------------------------------------------
// PgAuditStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed read view over the `audit_log` table.
 *
 * Writers live in `@openfoundry/db` (`writeAuditLog`, `AuditLogger`); this
 * store never inserts.  Uses parameterised queries exclusively.
 */
export class PgAuditStore implements AuditStore {
  readonly available = true;

  constructor(private pool: pg.Pool) {}

  async listEntries(query: AuditQuery): Promise<AuditLogEntry[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (query.action) {
      values.push(query.action);
      // `writeAuditLog` records dotted actions ("object.create") while
      // `AuditLogger` records bare verbs ("CREATE"); match either form.
      conditions.push(
        `(LOWER(action) = LOWER($${values.length})` +
          ` OR LOWER(split_part(action, '.', 2)) = LOWER($${values.length}))`,
      );
    }

    if (query.user) {
      values.push(`%${escapeLikePattern(query.user)}%`);
      const partial = `$${values.length}`;
      // The console renders raw RIDs but its filter is a free-text box, so a
      // person types either part of a RID or the name they know the principal
      // by; match part of the RID or part of the principal's own names.
      conditions.push(
        `(user_rid ILIKE ${partial}` +
          ` OR user_rid IN (SELECT rid FROM users` +
          ` WHERE username ILIKE ${partial}` +
          ` OR display_name ILIKE ${partial}` +
          ` OR email ILIKE ${partial}))`,
      );
    }

    if (query.dateFrom) {
      values.push(query.dateFrom);
      conditions.push(`timestamp >= $${values.length}::timestamptz`);
    }

    if (query.dateTo) {
      values.push(query.dateTo);
      // `dateTo` arrives as a calendar day (YYYY-MM-DD) from the console's
      // date picker, and the user means "through the end of that day".
      conditions.push(
        `timestamp < ($${values.length}::date + INTERVAL '1 day')`,
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    values.push(query.limit);
    const limitParam = `$${values.length}`;
    values.push(query.offset);
    const offsetParam = `$${values.length}`;

    const { rows } = await this.pool.query<AuditRow>({
      text: `SELECT id, timestamp, user_rid, action, resource_rid, resource_type,
                    details::text AS details
             FROM audit_log
             ${where}
             ORDER BY timestamp DESC, id DESC
             LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values,
    });

    return rows.map(rowToEntry);
  }
}
