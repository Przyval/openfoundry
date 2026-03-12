import type { QueryBuilder } from "./query-builder.js";

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Convert a JS Date to a PostgreSQL-friendly ISO-8601 timestamp string.
 */
export function toPgTimestamp(date: Date): string {
  return date.toISOString();
}

/**
 * Parse a PostgreSQL timestamp string into a JS Date.
 */
export function fromPgTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

// ---------------------------------------------------------------------------
// JSONB helpers
// ---------------------------------------------------------------------------

/**
 * Serialise a plain object to a JSON string suitable for inserting into a
 * JSONB column.
 */
export function jsonbSet(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Apply `LIMIT` / `OFFSET` pagination to a query builder.
 *
 * Returns the same builder instance for chaining.
 */
export function paginate(
  query: QueryBuilder,
  pageSize: number,
  offset: number,
): QueryBuilder {
  return query.limit(pageSize).offset(offset);
}
