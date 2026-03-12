import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { DatasetStore } from "../src/store/dataset-store.js";
import { FileStore } from "../src/store/file-store.js";
import { setEnforcePermissions } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

/** Headers that grant full ADMIN access. */
const ADMIN_HEADERS = {
  "x-user-id": "test-admin",
  "x-user-roles": "ADMIN",
};

/** Headers that grant read-only VIEWER access. */
const VIEWER_HEADERS = {
  "x-user-id": "test-viewer",
  "x-user-roles": "VIEWER",
};

let app: FastifyInstance;
let datasetStore: DatasetStore;
let fileStore: FileStore;

beforeEach(async () => {
  datasetStore = new DatasetStore();
  fileStore = new FileStore();
  app = await createServer({ config: TEST_CONFIG, datasetStore, fileStore });
});

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

describe("Health endpoints", () => {
  it("GET /status/health returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });
});

// -------------------------------------------------------------------------
// Dataset CRUD
// -------------------------------------------------------------------------

describe("Dataset CRUD", () => {
  it("POST /api/v2/datasets creates a dataset", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "test-dataset", description: "A test dataset" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("test-dataset");
    expect(body.rid).toMatch(/^ri\./);
  });

  it("GET /api/v2/datasets lists datasets", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "ds-a" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "ds-b" },
    });

    const res = await app.inject({ method: "GET", url: "/api/v2/datasets" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET /api/v2/datasets supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v2/datasets",
        payload: { name: `ds-${i}` },
      });
    }

    const page1 = await app.inject({
      method: "GET",
      url: "/api/v2/datasets?pageSize=2",
    });
    const body1 = page1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.nextPageToken).toBeDefined();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/v2/datasets?pageSize=2&pageToken=${body1.nextPageToken}`,
    });
    const body2 = page2.json();
    expect(body2.data).toHaveLength(2);
  });

  it("GET /api/v2/datasets/:rid returns a specific dataset", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "my-dataset", description: "Desc" },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("my-dataset");
  });

  it("DELETE /api/v2/datasets/:rid deletes a dataset", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "delete-me" },
    });
    const rid = createRes.json().rid;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${rid}`,
    });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("GET /api/v2/datasets/:rid returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/datasets/ri.datasets.main.dataset.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v2/datasets returns 409 for duplicate name", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "dup-ds" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "dup-ds" },
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Branch CRUD
// -------------------------------------------------------------------------

describe("Branch CRUD", () => {
  let datasetRid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "branch-test-ds" },
    });
    datasetRid = res.json().rid;
  });

  it("dataset has a default main branch", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/branches`,
    });
    expect(res.statusCode).toBe(200);
    const branches = res.json().data;
    expect(branches).toHaveLength(1);
    expect(branches[0].name).toBe("main");
    expect(branches[0].isDefault).toBe(true);
  });

  it("POST creates a branch", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/branches`,
      payload: { name: "develop" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("develop");
  });

  it("GET returns a specific branch", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/branches`,
      payload: { name: "feature" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/branches/feature`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("feature");
  });

  it("DELETE removes a branch", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/branches`,
      payload: { name: "temp" },
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${datasetRid}/branches/temp`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/branches/temp`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("DELETE returns error for default branch", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${datasetRid}/branches/main`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST returns 409 for duplicate branch name", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/branches`,
      payload: { name: "develop" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/branches`,
      payload: { name: "develop" },
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Transaction management
// -------------------------------------------------------------------------

describe("Transaction management", () => {
  let datasetRid: string;
  let branchRid: string;

  beforeEach(async () => {
    const dsRes = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "txn-test-ds" },
    });
    datasetRid = dsRes.json().rid;

    // Get the default branch RID
    const branchRes = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/branches/main`,
    });
    branchRid = branchRes.json().rid;
  });

  it("POST opens a transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions`,
      payload: { branchRid, type: "UPDATE" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("OPEN");
    expect(body.type).toBe("UPDATE");
  });

  it("POST commit commits a transaction", async () => {
    const openRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions`,
      payload: { branchRid, type: "APPEND" },
    });
    const txnRid = openRes.json().rid;

    const commitRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions/${txnRid}/commit`,
    });
    expect(commitRes.statusCode).toBe(200);
    expect(commitRes.json().status).toBe("COMMITTED");
    expect(commitRes.json().committedAt).toBeDefined();
  });

  it("POST abort aborts a transaction", async () => {
    const openRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions`,
      payload: { branchRid, type: "SNAPSHOT" },
    });
    const txnRid = openRes.json().rid;

    const abortRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions/${txnRid}/abort`,
    });
    expect(abortRes.statusCode).toBe(200);
    expect(abortRes.json().status).toBe("ABORTED");
  });

  it("cannot commit an already committed transaction", async () => {
    const openRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions`,
      payload: { branchRid, type: "UPDATE" },
    });
    const txnRid = openRes.json().rid;

    await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions/${txnRid}/commit`,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions/${txnRid}/commit`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("cannot abort an already aborted transaction", async () => {
    const openRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions`,
      payload: { branchRid, type: "UPDATE" },
    });
    const txnRid = openRes.json().rid;

    await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions/${txnRid}/abort`,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions/${txnRid}/abort`,
    });
    expect(res.statusCode).toBe(400);
  });
});

// -------------------------------------------------------------------------
// File upload/download
// -------------------------------------------------------------------------

describe("File upload/download", () => {
  let datasetRid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "file-test-ds" },
    });
    datasetRid = res.json().rid;
  });

  it("PUT uploads a file", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/data.csv`,
      payload: "col1,col2\nval1,val2",
      headers: { "content-type": "text/csv" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().path).toBe("data.csv");
    expect(res.json().size).toBeGreaterThan(0);
  });

  it("GET downloads a file", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/hello.txt`,
      payload: "Hello, World!",
      headers: { "content-type": "text/plain" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files/hello.txt`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("Hello, World!");
  });

  it("GET lists files", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/a.txt`,
      payload: "aaa",
    });
    await app.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/b.txt`,
      payload: "bbb",
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("DELETE removes a file", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/remove-me.txt`,
      payload: "temp",
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${datasetRid}/files/remove-me.txt`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files/remove-me.txt`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("GET returns 404 for nonexistent file", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files/nope.txt`,
    });
    expect(res.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Commit workflow (end-to-end)
// -------------------------------------------------------------------------

describe("Commit workflow", () => {
  it("full workflow: create dataset, open txn, upload file, commit", async () => {
    // Create dataset
    const dsRes = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      payload: { name: "workflow-ds" },
    });
    const datasetRid = dsRes.json().rid;

    // Get default branch
    const branchRes = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/branches/main`,
    });
    const branchRid = branchRes.json().rid;

    // Open transaction
    const txnRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions`,
      payload: { branchRid, type: "UPDATE" },
    });
    expect(txnRes.statusCode).toBe(201);
    const txnRid = txnRes.json().rid;

    // Upload file
    const fileRes = await app.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/report.csv`,
      payload: "id,value\n1,100",
      headers: { "content-type": "text/csv" },
    });
    expect(fileRes.statusCode).toBe(201);

    // Commit transaction
    const commitRes = await app.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/transactions/${txnRid}/commit`,
    });
    expect(commitRes.statusCode).toBe(200);
    expect(commitRes.json().status).toBe("COMMITTED");

    // Verify file is accessible
    const getFileRes = await app.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files/report.csv`,
    });
    expect(getFileRes.statusCode).toBe(200);
    expect(getFileRes.body).toBe("id,value\n1,100");
  });
});

// -------------------------------------------------------------------------
// Permission enforcement
// -------------------------------------------------------------------------

describe("Permission enforcement", () => {
  beforeEach(() => {
    setEnforcePermissions(true);
  });

  afterEach(() => {
    setEnforcePermissions(false);
  });

  it("allows ADMIN to create a dataset", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      headers: ADMIN_HEADERS,
      payload: { name: "perm-test-ds", description: "Permission test" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("allows VIEWER to list datasets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/datasets",
      headers: VIEWER_HEADERS,
    });
    expect(res.statusCode).toBe(200);
  });

  it("denies VIEWER from creating a dataset", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      headers: VIEWER_HEADERS,
      payload: { name: "denied-ds" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies VIEWER from deleting a dataset", async () => {
    // Create with admin first
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/datasets",
      headers: ADMIN_HEADERS,
      payload: { name: "del-perm-ds" },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${rid}`,
      headers: VIEWER_HEADERS,
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies requests with no identity when enforcement is enabled", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/datasets",
    });
    expect(res.statusCode).toBe(403);
  });
});
