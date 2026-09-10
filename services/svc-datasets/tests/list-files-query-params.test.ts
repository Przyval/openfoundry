/**
 * Behaviour of the Foundry scoping parameters on `GET /v2/datasets/{rid}/files`.
 *
 * The dataset store already models branches and transactions, so these
 * parameters resolve against real state rather than being accepted and dropped.
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
let mainBranchRid: string;
let featureBranchRid: string;
let firstTxnRid: string;
let secondTxnRid: string;
let featureTxnRid: string;

const bytes = (s: string) => new TextEncoder().encode(s);

beforeEach(async () => {
  datasetStore = new DatasetStore();
  fileStore = new FileStore();
  app = await createServer({ config: TEST_CONFIG, datasetStore, fileStore });

  datasetRid = datasetStore.createDataset({ name: "sales" }).rid;
  mainBranchRid = datasetStore.getBranch(datasetRid, "main").rid;
  featureBranchRid = datasetStore.createBranch(datasetRid, { name: "feature" }).rid;

  // Two transactions on main, then one on the feature branch, so the
  // transaction range covers a strict prefix of the dataset's history.
  firstTxnRid = datasetStore.openTransaction(datasetRid, {
    branchRid: mainBranchRid,
    type: "APPEND",
  }).rid;
  secondTxnRid = datasetStore.openTransaction(datasetRid, {
    branchRid: mainBranchRid,
    type: "APPEND",
  }).rid;
  featureTxnRid = datasetStore.openTransaction(datasetRid, {
    branchRid: featureBranchRid,
    type: "APPEND",
  }).rid;

  fileStore.putFile(datasetRid, "raw/a.csv", bytes("a"), "text/csv", firstTxnRid);
  fileStore.putFile(datasetRid, "raw/b.csv", bytes("b"), "text/csv", secondTxnRid);
  fileStore.putFile(
    datasetRid,
    "curated/c.csv",
    bytes("c"),
    "text/csv",
    featureTxnRid,
  );
  // Written outside any transaction, as the direct upload route does.
  fileStore.putFile(datasetRid, "notes.txt", bytes("n"), "text/plain", "");
});

function listFiles(query = "") {
  return app.inject({
    method: "GET",
    url: `/api/v2/datasets/${datasetRid}/files${query}`,
  });
}

const paths = (res: { json: () => any }) =>
  res.json().data.map((f: any) => f.path).sort();

// ===========================================================================
// pathPrefix
// ===========================================================================

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

  it("rejects a path with a leading slash", async () => {
    const res = await listFiles("?pathPrefix=/raw");
    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("InvalidFilePath");
  });
});

// ===========================================================================
// branchName
// ===========================================================================

describe("List files — branchName", () => {
  it("returns the files written on that branch", async () => {
    const res = await listFiles("?branchName=feature");
    // The untransacted file belongs to the dataset's view on every branch.
    expect(paths(res)).toEqual(["curated/c.csv", "notes.txt"]);
  });

  it("excludes files written on another branch", async () => {
    const res = await listFiles("?branchName=main");
    expect(paths(res)).toEqual(["notes.txt", "raw/a.csv", "raw/b.csv"]);
  });

  it("answers BranchNotFound for a branch the dataset does not have", async () => {
    const res = await listFiles("?branchName=nonexistent");
    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("BranchNotFound");
  });

  it("answers InvalidBranchName for a name that looks like a RID", async () => {
    const res = await listFiles(`?branchName=${mainBranchRid}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("InvalidBranchName");
  });
});

// ===========================================================================
// startTransactionRid / endTransactionRid
// ===========================================================================

describe("List files — transaction range", () => {
  it("returns files up to and including endTransactionRid", async () => {
    const res = await listFiles(`?endTransactionRid=${firstTxnRid}`);
    expect(paths(res)).toEqual(["raw/a.csv"]);
  });

  it("returns the files in the start-to-end range", async () => {
    const res = await listFiles(
      `?startTransactionRid=${firstTxnRid}&endTransactionRid=${secondTxnRid}`,
    );
    expect(paths(res)).toEqual(["raw/a.csv", "raw/b.csv"]);
  });

  it("returns only that transaction's files when start and end are the same", async () => {
    const res = await listFiles(
      `?startTransactionRid=${secondTxnRid}&endTransactionRid=${secondTxnRid}`,
    );
    expect(paths(res)).toEqual(["raw/b.csv"]);
  });

  it("combines with branchName", async () => {
    const res = await listFiles(
      `?branchName=main&endTransactionRid=${featureTxnRid}`,
    );
    expect(paths(res)).toEqual(["raw/a.csv", "raw/b.csv"]);
  });

  it("answers TransactionNotFound for a transaction the dataset does not have", async () => {
    const res = await listFiles("?endTransactionRid=ri.datasets.main.transaction.absent");
    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("TransactionNotFound");
  });
});
