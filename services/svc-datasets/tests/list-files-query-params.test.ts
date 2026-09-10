/**
 * Behaviour of `pathPrefix` on `GET /v2/datasets/{rid}/files`.
 *
 * Foundry also scopes this listing by branch and transaction range. Those are
 * deliberately not served: `FileStore` keeps one record per path, so a path
 * uploaded twice retains only the newest transaction and any range filter
 * would answer an empty set for it.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { DatasetStore } from "../src/store/dataset-store.js";
import { FileStore } from "../src/store/file-store.js";

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

let app: FastifyInstance;
let datasetStore: DatasetStore;
let fileStore: FileStore;
let datasetRid: string;

async function upload(path: string, body: string) {
  return app.inject({
    method: "PUT",
    url: `/api/v2/datasets/${datasetRid}/files/${path}`,
    headers: { "content-type": "text/csv" },
    payload: body,
  });
}

beforeEach(async () => {
  datasetStore = new DatasetStore();
  fileStore = new FileStore();
  app = await createServer({ config: TEST_CONFIG, datasetStore, fileStore });

  datasetRid = datasetStore.createDataset({ name: "sales" }).rid;

  await upload("raw/a.csv", "a");
  await upload("raw/b.csv", "b");
  await upload("curated/c.csv", "c");
  await upload("notes.txt", "n");
});

function listFiles(query = "") {
  return app.inject({
    method: "GET",
    url: `/api/v2/datasets/${datasetRid}/files${query}`,
  });
}

const paths = (res: { json: () => any }) =>
  res.json().data.map((f: any) => f.path).sort();

describe("List files — pathPrefix", () => {
  it("returns only files whose path starts with the prefix", async () => {
    const res = await listFiles("?pathPrefix=raw/");
    expect(res.statusCode).toBe(200);
    expect(paths(res)).toEqual(["raw/a.csv", "raw/b.csv"]);
  });

  it("returns just that file when the prefix matches one exactly", async () => {
    const res = await listFiles("?pathPrefix=notes.txt");
    expect(paths(res)).toEqual(["notes.txt"]);
  });

  it("returns every file when omitted", async () => {
    const res = await listFiles();
    expect(paths(res)).toEqual([
      "curated/c.csv",
      "notes.txt",
      "raw/a.csv",
      "raw/b.csv",
    ]);
  });

  it("returns nothing when no path matches", async () => {
    const res = await listFiles("?pathPrefix=archive/");
    expect(paths(res)).toEqual([]);
  });

  it("rejects a path with a leading slash", async () => {
    const res = await listFiles("?pathPrefix=/raw");
    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("InvalidFilePath");
  });
});

describe("Upload file", () => {
  it("stores the uploaded content under the requested path", async () => {
    const created = await upload("raw/d.csv", "d");
    expect(created.statusCode).toBe(201);
    expect(created.json().path).toBe("raw/d.csv");

    const download = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files/raw/d.csv`,
    });
    expect(download.body).toBe("d");
  });
});
