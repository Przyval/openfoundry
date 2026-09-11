/**
 * The `/api/v1` dataset surface, checked against the v1 models in
 * `foundry_sdk/v1/datasets/models.py`.
 *
 * Every assertion names the exact field set the reference declares rather than
 * checking a status code: v1 and v2 disagree about `Branch` and about the
 * transaction timestamps, so a response that merely arrives with a 200 proves
 * nothing about which version it is in.
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

const PARENT_FOLDER_RID = "ri.compass.main.folder.root";

let app: FastifyInstance;
let datasetStore: DatasetStore;
let fileStore: FileStore;

beforeEach(async () => {
  datasetStore = new DatasetStore();
  fileStore = new FileStore();
  app = await createServer({ config: TEST_CONFIG, datasetStore, fileStore });
});

/** Asserts that an object carries exactly these keys — no more, no fewer. */
function expectExactKeys(value: unknown, keys: string[]): void {
  expect(Object.keys(value as object).sort()).toEqual([...keys].sort());
}

async function createDataset(name = "sales"): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/datasets",
    payload: { name, parentFolderRid: PARENT_FOLDER_RID },
  });
  expect(res.statusCode).toBe(200);
  return res.json().rid;
}

describe("v1 datasets", () => {
  it("POST /api/v1/datasets answers a v1 Dataset", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/datasets",
      payload: { name: "sales", parentFolderRid: PARENT_FOLDER_RID },
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["rid", "name", "parentFolderRid"]);
    expect(res.json()).toMatchObject({
      name: "sales",
      parentFolderRid: PARENT_FOLDER_RID,
    });
  });

  it("POST /api/v1/datasets refuses a request with no parentFolderRid", async () => {
    // `Dataset.parentFolderRid` is required, so a dataset created without one
    // could not be serialized back as a conformant v1 response.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/datasets",
      payload: { name: "sales" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/datasets/{datasetRid} answers a v1 Dataset", async () => {
    const rid = await createDataset();
    const res = await app.inject({ method: "GET", url: `/api/v1/datasets/${rid}` });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["rid", "name", "parentFolderRid"]);
    expect(res.json().rid).toBe(rid);
  });
});

describe("v1 branches", () => {
  it("GET .../branches answers a v1 ListBranchesResponse of branchId-keyed branches", async () => {
    const rid = await createDataset();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${rid}/branches`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["data"]);
    expect(res.json().data).toEqual([{ branchId: "main" }]);
  });

  it("POST .../branches answers a v1 Branch, not the v2 name-keyed one", async () => {
    const rid = await createDataset();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/branches`,
      payload: { branchId: "experiment" },
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["branchId"]);
    expect(res.json().branchId).toBe("experiment");
    // The v2 model names this field `name`; a v1 client never reads it.
    expect(res.json()).not.toHaveProperty("name");
  });

  it("GET .../branches/{branchId} answers a v1 Branch", async () => {
    const rid = await createDataset();
    await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/branches`,
      payload: { branchId: "experiment" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${rid}/branches/experiment`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["branchId"]);
    expect(res.json().branchId).toBe("experiment");
  });

  it("DELETE .../branches/{branchId} answers 204 with no body", async () => {
    const rid = await createDataset();
    await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/branches`,
      payload: { branchId: "experiment" },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/datasets/${rid}/branches/experiment`,
    });

    // `DeleteBranch` declares no response type.
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
  });
});

describe("v1 transactions", () => {
  async function openTransaction(datasetRid: string, payload: object = {}) {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${datasetRid}/transactions`,
      payload,
    });
    expect(res.statusCode).toBe(200);
    return res;
  }

  it("POST .../transactions answers a v1 Transaction with createdTime and no closedTime", async () => {
    const rid = await createDataset();
    const res = await openTransaction(rid, { transactionType: "SNAPSHOT" });

    expectExactKeys(res.json(), [
      "rid",
      "transactionType",
      "status",
      "createdTime",
    ]);
    expect(res.json()).toMatchObject({
      transactionType: "SNAPSHOT",
      status: "OPEN",
    });
  });

  it("POST .../transactions defaults transactionType, which v1 makes optional", async () => {
    const rid = await createDataset();
    const res = await openTransaction(rid);
    expect(res.json().transactionType).toBe("APPEND");
  });

  it("POST .../transactions refuses a transaction type the store cannot open", async () => {
    // v1 declares DELETE among its transaction types; the store has no
    // representation for one, so it is refused rather than opened as an APPEND.
    const rid = await createDataset();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/transactions`,
      payload: { transactionType: "DELETE" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("POST .../transactions opens on the branch named by branchId", async () => {
    const rid = await createDataset();
    await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/branches`,
      payload: { branchId: "experiment" },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/transactions?branchId=experiment`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const branch = datasetStore.getBranch(rid, "experiment");
    const stored = datasetStore.getDataset(rid).transactions.get(res.json().rid);
    expect(stored?.branchRid).toBe(branch.rid);
  });

  it("POST .../transactions reports an unknown branchId rather than opening on the default", async () => {
    const rid = await createDataset();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/transactions?branchId=nope`,
      payload: {},
    });

    expect(res.statusCode).toBe(404);
  });

  it("POST .../transactions/{rid}/commit answers a v1 Transaction carrying closedTime", async () => {
    const rid = await createDataset();
    const transactionRid = (await openTransaction(rid)).json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/transactions/${transactionRid}/commit`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), [
      "rid",
      "transactionType",
      "status",
      "createdTime",
      "closedTime",
    ]);
    expect(res.json().status).toBe("COMMITTED");
  });

  it("POST .../transactions/{rid}/abort answers a v1 Transaction", async () => {
    const rid = await createDataset();
    const transactionRid = (await openTransaction(rid)).json().rid;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/transactions/${transactionRid}/abort`,
    });

    expect(res.statusCode).toBe(200);
    // The store timestamps a commit but not an abort, and `closedTime` is
    // optional in v1, so it is absent rather than invented.
    expectExactKeys(res.json(), [
      "rid",
      "transactionType",
      "status",
      "createdTime",
    ]);
    expect(res.json().status).toBe("ABORTED");
  });
});

describe("v1 files", () => {
  it("DELETE .../files/{filePath} answers 204 and removes the file", async () => {
    const rid = await createDataset();
    fileStore.putFile(rid, "nested/report.csv", new Uint8Array([1, 2]), "text/csv", "");

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/datasets/${rid}/files/nested/report.csv`,
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(fileStore.listFiles(rid)).toEqual([]);
  });

  it("GET .../files/{filePath} serves the exact v1 File model", async () => {
    const rid = await createDataset();
    const stored = fileStore.putFile(
      rid,
      "nested/report.csv",
      new Uint8Array([1, 2, 3]),
      "text/csv",
      "ri.foundry.main.transaction.t1",
    );

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${rid}/files/nested/report.csv`,
    });

    expect(res.statusCode).toBe(200);
    // `contentType` is not in the v1 model and must not leak into the response.
    expectExactKeys(res.json(), [
      "path",
      "transactionRid",
      "sizeBytes",
      "updatedTime",
    ]);
    expect(res.json()).toEqual({
      path: "nested/report.csv",
      transactionRid: "ri.foundry.main.transaction.t1",
      sizeBytes: 3,
      updatedTime: stored.updatedTime,
    });
  });

  it("serves a write time that is an ISO instant, not a fabricated one", async () => {
    const rid = await createDataset();
    const before = Date.now();
    fileStore.putFile(rid, "a.csv", new Uint8Array([1]), "text/csv", "");
    const after = Date.now();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${rid}/files/a.csv`,
    });

    const updatedTime = res.json().updatedTime as string;
    expect(updatedTime).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    const parsed = Date.parse(updatedTime);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });

  it("moves the write time when an existing path is overwritten", async () => {
    const rid = await createDataset();
    const first = fileStore.putFile(rid, "a.csv", new Uint8Array([1]), "text/csv", "");
    // `Date.now()` has millisecond resolution, so a same-millisecond rewrite
    // would compare equal without proving anything.
    await new Promise((resolve) => setTimeout(resolve, 5));
    fileStore.putFile(rid, "a.csv", new Uint8Array([1, 2]), "text/csv", "");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${rid}/files/a.csv`,
    });

    expect(Date.parse(res.json().updatedTime)).toBeGreaterThan(
      Date.parse(first.updatedTime),
    );
  });

  it("GET .../files pages over the v1 File model", async () => {
    const rid = await createDataset();
    fileStore.putFile(rid, "a.csv", new Uint8Array([1]), "text/csv", "");
    fileStore.putFile(rid, "b.csv", new Uint8Array([1, 2]), "text/csv", "");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${rid}/files`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
    for (const file of res.json().data) {
      expectExactKeys(file, ["path", "transactionRid", "sizeBytes", "updatedTime"]);
      expect(typeof file.updatedTime).toBe("string");
    }
  });

  it("refuses a branch- or transaction-scoped file request", async () => {
    // One record per path means a scoped read would answer out of the single
    // copy while reporting that it had honoured the scope.
    const rid = await createDataset();
    fileStore.putFile(rid, "a.csv", new Uint8Array([1]), "text/csv", "");

    for (const [url, param] of [
      [`/api/v1/datasets/${rid}/files?branchId=experiment`, "branchId"],
      [`/api/v1/datasets/${rid}/files?startTransactionRid=ri.t1`, "startTransactionRid"],
      [`/api/v1/datasets/${rid}/files/a.csv?endTransactionRid=ri.t2`, "endTransactionRid"],
    ] as const) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(400);
      expect(res.json().parameters.param).toBe(param);
    }

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/datasets/${rid}/files/a.csv?transactionRid=ri.t3`,
    });
    expect(del.statusCode).toBe(400);
    // The refusal must not have deleted the only copy on its way out.
    expect(fileStore.listFiles(rid)).toHaveLength(1);
  });

  it("does not serve the transactional v1 upload", async () => {
    // `POST .../files:upload` places a file in a named transaction, which a
    // store keeping one record per path cannot represent.
    const rid = await createDataset();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/datasets/${rid}/files:upload?filePath=a.csv`,
      payload: "a",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("v1 create dataset validation", () => {
  it("POST /api/v1/datasets refuses a request with no name", async () => {
    // `Dataset.name` is required on the way out too, so a dataset created
    // without one could not be serialized back as a conformant v1 response.
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/datasets",
      payload: { parentFolderRid: PARENT_FOLDER_RID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().parameters.param).toBe("name");
  });
});

describe("v1 datasets with no parent folder", () => {
  it("refuses to serve a dataset the v1 model cannot represent", async () => {
    // The v2 create route treats `parentFolderRid` as optional, where v1
    // `Dataset` requires it.
    const created = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "orphan" },
    });
    expect(created.statusCode).toBe(201);
    const rid = created.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/datasets/${rid}`,
    });

    expect(res.statusCode).not.toBe(200);
    expect(res.json().errorName).toBe("DatasetNotRepresentableInV1");
    expect(res.json().parameters).toMatchObject({ datasetRid: rid });
  });
});
