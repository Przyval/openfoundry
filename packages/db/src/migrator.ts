import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withTransaction } from "./pool.js";

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

/**
 * Run SQL migrations from `migrationsDir` against the given pool.
 *
 * - Creates a `_migrations` tracking table if it does not exist.
 * - Reads `.sql` files sorted lexicographically by name.
 * - Executes each un-applied migration inside its own transaction.
 * - Records the migration name on success.
 */
export async function runMigrations(
  pool: pg.Pool,
  migrationsDir: string,
): Promise<void> {
  // Ensure the tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Discover migration files
  const entries = await readdir(migrationsDir);
  const sqlFiles = entries
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Determine which migrations have already been applied
  const { rows: applied } = await pool.query<{ name: string }>(
    "SELECT name FROM _migrations ORDER BY name",
  );
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const file of sqlFiles) {
    if (appliedSet.has(file)) {
      continue;
    }

    const filePath = join(migrationsDir, file);
    const sqlText = await readFile(filePath, "utf-8");

    await withTransaction(pool, async (client) => {
      await client.query(sqlText);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    });
  }
}
