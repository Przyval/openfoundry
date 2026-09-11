/**
 * The write time on the Postgres-backed path.
 *
 * Every earlier "only shows up on Postgres" defect in this repository passed
 * the in-memory suite first, so `updatedTime` is checked here three ways that
 * an in-memory test cannot reach:
 *
 *  1. `PgFileStore` writes the column and reads it back into `StoredFile`.
 *  2. The column it writes actually exists in both schema sources. This is the
 *     precise defect being fixed: `putFile`'s ON CONFLICT clause has always set
 *     `updated_at = NOW()` against a table no migration gave that column, so
 *     every overwrite of an existing path failed with `42703 undefined_column`
 *     while the in-memory store overwrote happily.
 *  3. The routes await the store, so a Postgres deployment serves the file and
 *     not a pending promise.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { DatasetStore } from "../src/store/dataset-store.js";
import { FileStore, type StoredFile } from "../src/store/file-store.js";
import { PgFileStore } from "../src/store/pg-file-store.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

// ---------------------------------------------------------------------------
// 1. PgFileStore round-trips the write time
// ---------------------------------------------------------------------------

/** Records every statement and answers with canned rows. */
class FakePool {
  readonly statements: string[] = [];

  constructor(private readonly rows: Record<string, unknown>[]) {}

  async query(config: { text: string; values?: unknown[] }) {
    this.statements.push(config.text);
    return { rows: this.rows, rowCount: this.rows.length };
  }
}

function pgStore(rows: Record<string, unknown>[]): {
  store: PgFileStore;
  pool: FakePool;
} {
  const pool = new FakePool(rows);
  return { store: new PgFileStore(pool as unknown as pg.Pool), pool };
}

const ROW = {
  dataset_rid: "ri.foundry.main.dataset.d1",
  path: "raw/a.csv",
  size: 3,
  content_type: "text/csv",
  transaction_rid: "ri.foundry.main.transaction.t1",
  created_at: new Date("2024-01-01T00:00:00.000Z"),
  updated_at: new Date("2024-06-02T03:04:05.000Z"),
};

describe("PgFileStore records the write time", () => {
  it("writes updated_at on insert and on overwrite, and returns what it wrote", async () => {
    const { store, pool } = pgStore([{ updated_at: ROW.updated_at }]);

    const file = await store.putFile(
      ROW.dataset_rid,
      ROW.path,
      new Uint8Array([1, 2, 3]),
      "text/csv",
      ROW.transaction_rid,
    );

    const sql = pool.statements[0];
    expect(sql).toMatch(/INSERT INTO dataset_files[\s\S]*updated_at/);
    // The overwrite branch must move it too, or a re-uploaded path would keep
    // reporting the time of its first write.
    expect(sql).toMatch(/DO UPDATE SET[\s\S]*updated_at = NOW\(\)/);
    expect(file.updatedTime).toBe("2024-06-02T03:04:05.000Z");
  });

  it("serves the stored write time on a read, not the time of the read", async () => {
    const { store } = pgStore([ROW]);
    const file = await store.getFile(ROW.dataset_rid, ROW.path);
    expect(file.updatedTime).toBe("2024-06-02T03:04:05.000Z");
  });

  it("carries the write time through a listing", async () => {
    const { store } = pgStore([ROW]);
    const [file] = await store.listFiles(ROW.dataset_rid);
    expect(file.updatedTime).toBe("2024-06-02T03:04:05.000Z");
  });

  it("normalises a driver that hands back a string instead of a Date", async () => {
    const { store } = pgStore([{ ...ROW, updated_at: "2024-06-02T03:04:05.000Z" }]);
    const file = await store.getFile(ROW.dataset_rid, ROW.path);
    expect(file.updatedTime).toBe("2024-06-02T03:04:05.000Z");
  });
});

// ---------------------------------------------------------------------------
// 2. Both schema sources have the column the store writes
// ---------------------------------------------------------------------------

describe("dataset_files carries updated_at in every schema source", () => {
  it.each([
    ["db/migrations (pnpm db:migrate)", "db/migrations/010_dataset_file_updated_at.sql"],
    ["scripts/migrate.sql (Docker Compose init)", "scripts/migrate.sql"],
  ])("%s", (_label, relative) => {
    const sql = readFileSync(path.join(REPO_ROOT, relative), "utf8");
    expect(sql).toMatch(/dataset_files[\s\S]*updated_at/);
  });

  it("never backfills an existing row with the time of the migration", () => {
    // A pre-existing row's write time is its `created_at` - the overwrite path
    // could not succeed before this migration, so the insert is the only write
    // that row ever had. `NOW()` would invent one.
    const sql = readFileSync(
      path.join(REPO_ROOT, "db/migrations/010_dataset_file_updated_at.sql"),
      "utf8",
    );
    expect(sql).toMatch(/UPDATE dataset_files SET updated_at = created_at/);
    expect(sql).not.toMatch(/SET updated_at = NOW\(\)\s+WHERE/);
  });
});

// ---------------------------------------------------------------------------
// 3. The routes await an asynchronous store
// ---------------------------------------------------------------------------

/** Delegates to the in-memory store but answers asynchronously, as PgFileStore does. */
class AsyncFileStore {
  constructor(private readonly inner: FileStore) {}

  async putFile(
    datasetRid: string,
    filePath: string,
    content: Uint8Array,
    contentType: string,
    transactionRid: string,
  ): Promise<StoredFile> {
    return this.inner.putFile(datasetRid, filePath, content, contentType, transactionRid);
  }

  async getFile(datasetRid: string, filePath: string): Promise<StoredFile> {
    return this.inner.getFile(datasetRid, filePath);
  }

  async listFiles(datasetRid: string): Promise<StoredFile[]> {
    return this.inner.listFiles(datasetRid);
  }

  async deleteFile(datasetRid: string, filePath: string): Promise<void> {
    this.inner.deleteFile(datasetRid, filePath);
  }
}

describe("file routes against an asynchronous store", () => {
  let app: FastifyInstance;
  let datasetRid: string;

  beforeEach(async () => {
    const datasetStore = new DatasetStore();
    const fileStore = new AsyncFileStore(new FileStore());
    app = await createServer({
      config: TEST_CONFIG,
      datasetStore,
      // The server accepts either store; this double stands in for PgFileStore.
      fileStore: fileStore as unknown as FileStore,
    });
    datasetRid = datasetStore.createDataset({
      name: "sales",
      parentFolderRid: "ri.compass.main.folder.root",
    }).rid;

    await app.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/raw/a.csv`,
      headers: { "content-type": "text/csv" },
      payload: "abc",
    });
  });

  it("serves a complete v2 File rather than a pending promise", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    const [file] = res.json().data;
    expect(Object.keys(file).sort()).toEqual([
      "path",
      "sizeBytes",
      "transactionRid",
      "updatedTime",
    ]);
    expect(Date.parse(file.updatedTime)).not.toBeNaN();
  });

  it("serves a complete v1 File rather than a pending promise", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${datasetRid}/files/raw/a.csv`,
    });

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json()).sort()).toEqual([
      "path",
      "sizeBytes",
      "transactionRid",
      "updatedTime",
    ]);
    expect(Date.parse(res.json().updatedTime)).not.toBeNaN();
  });

  it("deletes through the async store", async () => {
    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/datasets/${datasetRid}/files/raw/a.csv`,
    });
    expect(del.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${datasetRid}/files`,
    });
    expect(list.json().data).toEqual([]);
  });
});
