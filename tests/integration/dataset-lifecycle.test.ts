import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("Dataset lifecycle: create, branch, upload, download, delete", () => {
  let datasetsApp: FastifyInstance;
  let datasetRid: string;

  beforeAll(async () => {
    const { createServer: createDatasetsServer } = await import(
      "../../services/svc-datasets/src/server.js"
    );
    datasetsApp = await createDatasetsServer();
  });

  afterAll(async () => {
    await datasetsApp?.close();
  });

  it("creates a dataset", async () => {
    const res = await datasetsApp.inject({
      method: "POST",
      url: "/api/v2/datasets",
      headers: { "content-type": "application/json" },
      payload: {
        name: "test-dataset",
        description: "Integration test dataset",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rid).toBeDefined();
    expect(body.name).toBe("test-dataset");
    expect(body.description).toBe("Integration test dataset");
    datasetRid = body.rid;
  });

  it("retrieves the dataset by RID", async () => {
    const res = await datasetsApp.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rid).toBe(datasetRid);
    expect(body.name).toBe("test-dataset");
  });

  it("lists datasets and includes the created one", async () => {
    const res = await datasetsApp.inject({
      method: "GET",
      url: "/api/v2/datasets",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const found = body.data.find(
      (d: { rid: string }) => d.rid === datasetRid,
    );
    expect(found).toBeDefined();
  });

  it("creates a branch on the dataset", async () => {
    const res = await datasetsApp.inject({
      method: "POST",
      url: `/api/v2/datasets/${datasetRid}/branches`,
      headers: { "content-type": "application/json" },
      payload: { name: "feature-branch" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("feature-branch");
  });

  it("lists branches on the dataset", async () => {
    const res = await datasetsApp.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/branches`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const found = body.data.find(
      (b: { name: string }) => b.name === "feature-branch",
    );
    expect(found).toBeDefined();
  });

  it("uploads a file to the dataset", async () => {
    const content = "col1,col2\nfoo,bar\nbaz,qux\n";
    const res = await datasetsApp.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/data/test.csv`,
      headers: { "content-type": "text/csv" },
      payload: content,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.path).toBe("data/test.csv");
    expect(body.contentType).toBe("text/csv");
    expect(body.size).toBe(Buffer.byteLength(content));
  });

  it("lists files on the dataset", async () => {
    const res = await datasetsApp.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].path).toBe("data/test.csv");
  });

  it("downloads the file and verifies content", async () => {
    const res = await datasetsApp.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files/data/test.csv`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toBe("col1,col2\nfoo,bar\nbaz,qux\n");
  });

  it("uploads a second file and lists both", async () => {
    const res = await datasetsApp.inject({
      method: "PUT",
      url: `/api/v2/datasets/${datasetRid}/files/data/readme.txt`,
      headers: { "content-type": "text/plain" },
      payload: "This is a readme file.",
    });
    expect(res.statusCode).toBe(201);

    const listRes = await datasetsApp.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files`,
    });
    expect(listRes.json().data.length).toBe(2);
  });

  it("deletes a file", async () => {
    const res = await datasetsApp.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${datasetRid}/files/data/readme.txt`,
    });
    expect(res.statusCode).toBe(204);

    const listRes = await datasetsApp.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/files`,
    });
    expect(listRes.json().data.length).toBe(1);
  });

  it("deletes the branch", async () => {
    const res = await datasetsApp.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${datasetRid}/branches/feature-branch`,
    });
    expect(res.statusCode).toBe(204);

    const listRes = await datasetsApp.inject({
      method: "GET",
      url: `/api/v2/datasets/${datasetRid}/branches`,
    });
    const found = listRes.json().data.find(
      (b: { name: string }) => b.name === "feature-branch",
    );
    expect(found).toBeUndefined();
  });

  it("deletes the dataset", async () => {
    const res = await datasetsApp.inject({
      method: "DELETE",
      url: `/api/v2/datasets/${datasetRid}`,
    });
    expect(res.statusCode).toBe(204);

    const listRes = await datasetsApp.inject({
      method: "GET",
      url: "/api/v2/datasets",
    });
    const found = listRes.json().data.find(
      (d: { rid: string }) => d.rid === datasetRid,
    );
    expect(found).toBeUndefined();
  });
});
