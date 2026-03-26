import pg from "pg";

// ---------------------------------------------------------------------------
// Singleton pool — connects using DATABASE_URL when available
// ---------------------------------------------------------------------------

let _pool: pg.Pool | null = null;

/**
 * Returns the shared connection pool. Creates one on first call using
 * `process.env.DATABASE_URL`.  Returns `null` when `DATABASE_URL` is not set,
 * allowing callers to gracefully fall back to JSON file storage.
 */
export function getPool(): pg.Pool | null {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  _pool = new pg.Pool({ connectionString });
  return _pool;
}

/**
 * Convenience wrapper around `pool.query()`.
 * Throws if no pool is available (DATABASE_URL not set).
 */
export async function query(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult> {
  const pool = getPool();
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not set — cannot execute PostgreSQL queries",
    );
  }
  return pool.query(text, params);
}

/**
 * Drain and close the singleton pool (e.g. on graceful shutdown).
 */
export async function closeSharedPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

export { _pool as pool };
