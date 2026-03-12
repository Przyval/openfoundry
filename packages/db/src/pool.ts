import pg from "pg";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DatabaseConfig {
  /** PostgreSQL connection string (e.g. postgres://user:pass@host:5432/db). */
  connectionString: string;
  /** Maximum number of clients in the pool.  Defaults to 20. */
  maxConnections?: number;
  /** Milliseconds a client can sit idle before being closed.  Defaults to 30 000. */
  idleTimeoutMs?: number;
  /** Milliseconds to wait when requesting a client before timing out.  Defaults to 5 000. */
  connectionTimeoutMs?: number;
  /** Enable SSL for the connection.  Defaults to false. */
  ssl?: boolean;
}

// ---------------------------------------------------------------------------
// Pool lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a `pg.Pool` from the given configuration.
 */
export function createPool(config: DatabaseConfig): pg.Pool {
  return new pg.Pool({
    connectionString: config.connectionString,
    max: config.maxConnections ?? 20,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 5_000,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Gracefully drain and close a pool.
 */
export async function closePool(pool: pg.Pool): Promise<void> {
  await pool.end();
}

// ---------------------------------------------------------------------------
// Transaction helper
// ---------------------------------------------------------------------------

/**
 * Execute `fn` inside a database transaction.
 *
 * - Automatically acquires a client from the pool
 * - Calls `BEGIN` before `fn` and `COMMIT` after
 * - Rolls back and re-throws on error
 * - Always releases the client back to the pool
 */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
