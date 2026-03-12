// Simple migration runner
import { createPool, closePool } from "@openfoundry/db";
import { runMigrations } from "@openfoundry/db";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const pool = createPool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://openfoundry:openfoundry@localhost:5432/openfoundry",
  });
  await runMigrations(pool, path.join(__dirname, "..", "db", "migrations"));
  await closePool(pool);
  console.log("Migrations complete.");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
