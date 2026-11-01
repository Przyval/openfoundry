/**
 * The models block is one text contract shared by both schema sources.
 *
 * `scripts/migrate.sql` is what Docker Compose loads at init and
 * `db/migrations/012_models.sql` is what `pnpm db:migrate` applies; the
 * migration is carried verbatim inside the consolidated file, so an edit to
 * one that is not made to the other fails here. Whether the store actually
 * works against each source is proven by executing it there, in
 * `models-contract.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("models schema sources", () => {
  it("scripts/migrate.sql carries db/migrations/012_models.sql byte for byte", () => {
    const migration = readFileSync(path.join(REPO_ROOT, "db/migrations/012_models.sql"), "utf8");
    const consolidated = readFileSync(path.join(REPO_ROOT, "scripts/migrate.sql"), "utf8");
    expect(consolidated).toContain(migration);
  });
});
