/**
 * The columns `PgModelStore` names must exist in both schema sources.
 *
 * `scripts/migrate.sql` is what Docker Compose loads at init and
 * `db/migrations/*.sql` is what `pnpm db:migrate` applies. A store naming a
 * column only one of them carries fails at runtime with `42703` while every
 * in-memory test stays green, so this runs without a database: it asserts the
 * SQL the store sends, then that both sources declare what that SQL names.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  PgModelStore,
  RESOURCE_COLUMNS,
  RESOURCE_NAME_CONSTRAINT,
  VERSION_COLUMNS,
  type Queryable,
} from "../src/models/pg-model-store.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const SCHEMA_SOURCES = {
  "scripts/migrate.sql": readFileSync(path.join(REPO_ROOT, "scripts/migrate.sql"), "utf8"),
  "db/migrations/012_models.sql": readFileSync(
    path.join(REPO_ROOT, "db/migrations/012_models.sql"),
    "utf8",
  ),
};

/** The body of one `CREATE TABLE IF NOT EXISTS <name> ( ... );` statement. */
function tableBody(sql: string, table: string): string {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  expect(start, `${table} is declared`).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(");", start));
}

describe("models schema sources", () => {
  for (const [name, sql] of Object.entries(SCHEMA_SOURCES)) {
    it(`${name} declares every column and the constraint the store relies on`, () => {
      const resources = tableBody(sql, "ml_resources");
      for (const column of [...RESOURCE_COLUMNS, "seq"]) {
        expect(resources, `ml_resources.${column}`).toMatch(new RegExp(`\\b${column}\\b`));
      }
      expect(resources).toContain(
        `CONSTRAINT ${RESOURCE_NAME_CONSTRAINT} UNIQUE (parent_folder_rid, display_name)`,
      );

      const versions = tableBody(sql, "ml_model_versions");
      for (const column of [...VERSION_COLUMNS, "seq"]) {
        expect(versions, `ml_model_versions.${column}`).toMatch(new RegExp(`\\b${column}\\b`));
      }
      // Listings order by `seq`; a timestamp would be ambiguous within a millisecond.
      expect(versions).toMatch(/\bseq\s+BIGSERIAL\b/);
    });
  }

  it("the two sources carry the models block byte for byte", () => {
    const migration = SCHEMA_SOURCES["db/migrations/012_models.sql"];
    expect(SCHEMA_SOURCES["scripts/migrate.sql"]).toContain(migration);
  });
});

/** Records every statement and answers with no rows. */
class RecordingPool {
  readonly statements: string[] = [];

  async query(config: { text: string }) {
    this.statements.push(config.text.replace(/\s+/g, " "));
    return { rows: [], rowCount: 0 };
  }
}

describe("PgModelStore SQL", () => {
  it("reads and writes only the declared tables and columns, and lists by seq", async () => {
    const pool = new RecordingPool();
    const store = new PgModelStore(pool as unknown as Queryable);
    await store.getResource("r", "MODEL");
    await store.getVersion("v");
    await store.listVersions("m", "master", 0, 10);

    const [getResource, getVersion, list] = pool.statements;
    expect(getResource).toContain(`SELECT ${RESOURCE_COLUMNS.join(", ")} FROM ml_resources`);
    expect(getVersion).toContain(`SELECT ${VERSION_COLUMNS.join(", ")} FROM ml_model_versions`);
    expect(list).toMatch(/ORDER BY seq OFFSET \$3 LIMIT \$4/);
    expect(list).not.toMatch(/created_time\s+(ASC|DESC)|ORDER BY created_time/);
  });
});
