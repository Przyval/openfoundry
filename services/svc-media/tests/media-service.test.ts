import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { MediaStore } from "../src/store/media-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let store: MediaStore;

beforeEach(async () => {
  store = new MediaStore();
  app = await createServer({ config: TEST_CONFIG, store });
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
// Upload and download
// -------------------------------------------------------------------------

describe("Media upload and download", () => {
  it("POST /api/v2/media/upload stores media and returns metadata", async () => {
    const content = Buffer.from("Hello, World!");
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/media/upload",
      headers: {
        "content-type": "text/plain",
        "x-filename": "hello.txt",
      },
      payload: content,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rid).toMatch(/^ri\./);
    expect(body.filename).toBe("hello.txt");
    expect(body.contentType).toBe("text/plain");
    expect(body.size).toBe(13);
  });

  it("GET /api/v2/media/:mediaRid downloads the media", async () => {
    const content = Buffer.from("binary data here");
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v2/media/upload",
      headers: {
        "content-type": "application/octet-stream",
        "x-filename": "data.bin",
      },
      payload: content,
    });
    const rid = uploadRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/media/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.body).toBe("binary data here");
  });

  it("GET /api/v2/media/:mediaRid returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/media/ri.media.main.media.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /api/v2/media/:mediaRid deletes media", async () => {
    const content = Buffer.from("delete me");
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v2/media/upload",
      headers: {
        "content-type": "text/plain",
        "x-filename": "temp.txt",
      },
      payload: content,
    });
    const rid = uploadRes.json().rid;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/media/${rid}`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/media/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Metadata
// -------------------------------------------------------------------------

describe("Media metadata", () => {
  let mediaRid: string;

  beforeEach(async () => {
    const content = Buffer.from("test file");
    const uploadRes = await app.inject({
      method: "POST",
      url: "/api/v2/media/upload",
      headers: {
        "content-type": "text/plain",
        "x-filename": "meta-test.txt",
      },
      payload: content,
    });
    mediaRid = uploadRes.json().rid;
  });

  it("GET /api/v2/media/:mediaRid/metadata returns metadata", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/media/${mediaRid}/metadata`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rid).toBe(mediaRid);
    expect(body.filename).toBe("meta-test.txt");
    expect(body.contentType).toBe("text/plain");
  });

  it("PUT /api/v2/media/:mediaRid/metadata updates metadata", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/media/${mediaRid}/metadata`,
      payload: { author: "test-user", tags: "important" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.metadata.author).toBe("test-user");
    expect(body.metadata.tags).toBe("important");
  });

  it("PUT /api/v2/media/:mediaRid/metadata merges with existing metadata", async () => {
    await app.inject({
      method: "PUT",
      url: `/api/v2/media/${mediaRid}/metadata`,
      payload: { key1: "val1" },
    });
    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/media/${mediaRid}/metadata`,
      payload: { key2: "val2" },
    });
    const body = res.json();
    expect(body.metadata.key1).toBe("val1");
    expect(body.metadata.key2).toBe("val2");
  });
});

// -------------------------------------------------------------------------
// List
// -------------------------------------------------------------------------

describe("Media listing", () => {
  it("GET /api/v2/media lists media (paginated)", async () => {
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v2/media/upload",
        headers: {
          "content-type": "text/plain",
          "x-filename": `file-${i}.txt`,
        },
        payload: Buffer.from(`content ${i}`),
      });
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/media",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
  });

  it("GET /api/v2/media supports pageSize parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v2/media/upload",
        headers: {
          "content-type": "text/plain",
          "x-filename": `file-${i}.txt`,
        },
        payload: Buffer.from(`content ${i}`),
      });
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/media?pageSize=2",
    });
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.nextPageToken).toBeDefined();
  });
});
