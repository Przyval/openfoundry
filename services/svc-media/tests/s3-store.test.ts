import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @aws-sdk/client-s3
// ---------------------------------------------------------------------------

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({ _type: "PutObject", input })),
    GetObjectCommand: vi.fn().mockImplementation((input) => ({ _type: "GetObject", input })),
    DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ _type: "DeleteObject", input })),
    ListObjectsV2Command: vi.fn().mockImplementation((input) => ({ _type: "ListObjectsV2", input })),
    HeadObjectCommand: vi.fn().mockImplementation((input) => ({ _type: "HeadObject", input })),
    CopyObjectCommand: vi.fn().mockImplementation((input) => ({ _type: "CopyObject", input })),
  };
});

vi.mock("@openfoundry/rid", () => ({
  generateRid: vi.fn().mockReturnValue({ toString: () => "rid.media.media.test123" }),
}));

vi.mock("@openfoundry/errors", () => ({
  notFound: (type: string, id: string) => {
    const err = new Error(`${type} not found: ${id}`);
    (err as any).statusCode = 404;
    (err as any).errorCode = "NOT_FOUND";
    return err;
  },
}));

import { S3MediaStore, type S3Config } from "../src/store/s3-media-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig: S3Config = {
  endpoint: "http://localhost:9000",
  region: "us-east-1",
  bucket: "test-bucket",
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  forcePathStyle: true,
};

function makeStore(): S3MediaStore {
  return new S3MediaStore(defaultConfig);
}

const testContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("S3MediaStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // store
  // -----------------------------------------------------------------------

  it("should upload a file to S3 and return StoredMedia", async () => {
    mockSend.mockResolvedValueOnce({}); // PutObjectCommand response

    const store = makeStore();
    const result = await store.store("photo.png", "image/png", testContent, { tag: "avatar" }, "user-1");

    expect(result.rid).toBe("rid.media.media.test123");
    expect(result.filename).toBe("photo.png");
    expect(result.contentType).toBe("image/png");
    expect(result.size).toBe(4);
    expect(result.metadata).toEqual({ tag: "avatar" });
    expect(result.uploadedBy).toBe("user-1");
    expect(result.createdAt).toBeDefined();

    // Verify PutObjectCommand was sent
    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe("PutObject");
    expect(cmd.input.Bucket).toBe("test-bucket");
    expect(cmd.input.Key).toBe("media/rid.media.media.test123");
    expect(cmd.input.ContentType).toBe("image/png");
  });

  it("should store without optional uploadedBy", async () => {
    mockSend.mockResolvedValueOnce({});

    const store = makeStore();
    const result = await store.store("doc.pdf", "application/pdf", testContent);

    expect(result.uploadedBy).toBeUndefined();
    expect(result.metadata).toEqual({});
  });

  // -----------------------------------------------------------------------
  // get
  // -----------------------------------------------------------------------

  it("should download a file from S3", async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToByteArray: () => Promise.resolve(testContent) },
      ContentType: "image/png",
      Metadata: {
        "x-of-filename": "photo.png",
        "x-of-created-at": "2025-01-01T00:00:00.000Z",
        "x-of-uploaded-by": "user-1",
        tag: "avatar",
      },
    });

    const store = makeStore();
    const result = await store.get("rid.media.media.test123");

    expect(result.rid).toBe("rid.media.media.test123");
    expect(result.filename).toBe("photo.png");
    expect(result.contentType).toBe("image/png");
    expect(result.size).toBe(4);
    expect(result.content).toEqual(testContent);
    expect(result.metadata).toEqual({ tag: "avatar" });
    expect(result.uploadedBy).toBe("user-1");
    expect(result.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("should throw notFound when object does not exist (get)", async () => {
    const err = new Error("NoSuchKey");
    (err as any).name = "NoSuchKey";
    mockSend.mockRejectedValueOnce(err);

    const store = makeStore();
    await expect(store.get("nonexistent")).rejects.toThrow("Media not found: nonexistent");
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  it("should delete an object from S3", async () => {
    // First call: HeadObjectCommand (from getMetadata in delete)
    mockSend.mockResolvedValueOnce({
      ContentType: "image/png",
      ContentLength: 4,
      Metadata: {
        "x-of-filename": "photo.png",
        "x-of-created-at": "2025-01-01T00:00:00.000Z",
      },
    });
    // Second call: DeleteObjectCommand
    mockSend.mockResolvedValueOnce({});

    const store = makeStore();
    await store.delete("rid.media.media.test123");

    expect(mockSend).toHaveBeenCalledTimes(2);
    const deleteCmd = mockSend.mock.calls[1][0];
    expect(deleteCmd._type).toBe("DeleteObject");
    expect(deleteCmd.input.Key).toBe("media/rid.media.media.test123");
  });

  it("should throw notFound when deleting nonexistent object", async () => {
    const err = new Error("NotFound");
    (err as any).name = "NotFound";
    (err as any).$metadata = { httpStatusCode: 404 };
    mockSend.mockRejectedValueOnce(err);

    const store = makeStore();
    await expect(store.delete("nonexistent")).rejects.toThrow("Media not found: nonexistent");
  });

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  it("should list objects from S3", async () => {
    // ListObjectsV2 response
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: "media/rid-1" },
        { Key: "media/rid-2" },
      ],
    });
    // HeadObject for rid-1
    mockSend.mockResolvedValueOnce({
      ContentType: "image/png",
      ContentLength: 100,
      Metadata: {
        "x-of-filename": "a.png",
        "x-of-created-at": "2025-01-01T00:00:00.000Z",
      },
    });
    // HeadObject for rid-2
    mockSend.mockResolvedValueOnce({
      ContentType: "application/pdf",
      ContentLength: 200,
      Metadata: {
        "x-of-filename": "b.pdf",
        "x-of-created-at": "2025-01-02T00:00:00.000Z",
      },
    });

    const store = makeStore();
    const results = await store.list();

    expect(results).toHaveLength(2);
    expect(results[0].rid).toBe("rid-1");
    expect(results[0].filename).toBe("a.png");
    expect(results[1].rid).toBe("rid-2");
    expect(results[1].filename).toBe("b.pdf");
  });

  it("should return empty array when bucket is empty", async () => {
    mockSend.mockResolvedValueOnce({ Contents: [] });

    const store = makeStore();
    const results = await store.list();

    expect(results).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // getMetadata
  // -----------------------------------------------------------------------

  it("should get metadata via HeadObject", async () => {
    mockSend.mockResolvedValueOnce({
      ContentType: "image/jpeg",
      ContentLength: 512,
      Metadata: {
        "x-of-filename": "selfie.jpg",
        "x-of-created-at": "2025-06-15T12:00:00.000Z",
        "x-of-uploaded-by": "user-42",
        category: "profile",
      },
    });

    const store = makeStore();
    const meta = await store.getMetadata("rid.media.media.abc");

    expect(meta.rid).toBe("rid.media.media.abc");
    expect(meta.filename).toBe("selfie.jpg");
    expect(meta.contentType).toBe("image/jpeg");
    expect(meta.size).toBe(512);
    expect(meta.uploadedBy).toBe("user-42");
    expect(meta.metadata).toEqual({ category: "profile" });

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe("HeadObject");
  });

  // -----------------------------------------------------------------------
  // updateMetadata
  // -----------------------------------------------------------------------

  it("should update metadata using CopyObject", async () => {
    // First HeadObject (getMetadata in updateMetadata)
    mockSend.mockResolvedValueOnce({
      ContentType: "image/png",
      ContentLength: 100,
      Metadata: {
        "x-of-filename": "photo.png",
        "x-of-created-at": "2025-01-01T00:00:00.000Z",
        existing: "value",
      },
    });
    // Second HeadObject (for existing S3 metadata)
    mockSend.mockResolvedValueOnce({
      ContentType: "image/png",
      ContentLength: 100,
      Metadata: {
        "x-of-filename": "photo.png",
        "x-of-created-at": "2025-01-01T00:00:00.000Z",
        existing: "value",
      },
    });
    // CopyObject
    mockSend.mockResolvedValueOnce({});

    const store = makeStore();
    const result = await store.updateMetadata("rid.media.media.xyz", { newKey: "newVal" });

    expect(result.metadata).toEqual({ existing: "value", newKey: "newVal" });

    const copyCmd = mockSend.mock.calls[2][0];
    expect(copyCmd._type).toBe("CopyObject");
    expect(copyCmd.input.MetadataDirective).toBe("REPLACE");
    expect(copyCmd.input.Metadata).toEqual({
      "x-of-filename": "photo.png",
      "x-of-created-at": "2025-01-01T00:00:00.000Z",
      existing: "value",
      newKey: "newVal",
    });
  });
});
