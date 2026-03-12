import { describe, it, expect } from "vitest";
import {
  encodePageToken,
  decodePageToken,
  normalizePageRequest,
  createPageResponse,
  paginate,
  collectAll,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../src/index.js";
import type { PageToken, PageCursor, PageResponse } from "../src/index.js";

// ---------------------------------------------------------------------------
// PageToken encode/decode
// ---------------------------------------------------------------------------

describe("PageToken", () => {
  it("should roundtrip a simple cursor", () => {
    const cursor: PageCursor = { offset: 42 };
    const token = encodePageToken(cursor);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(decodePageToken(token)).toEqual(cursor);
  });

  it("should roundtrip a cursor with lastId", () => {
    const cursor: PageCursor = { offset: 100, lastId: "abc-123" };
    const decoded = decodePageToken(encodePageToken(cursor));
    expect(decoded).toEqual(cursor);
  });

  it("should roundtrip a cursor with sortValues", () => {
    const cursor: PageCursor = {
      offset: 0,
      sortValues: ["name", 42, null, true],
    };
    const decoded = decodePageToken(encodePageToken(cursor));
    expect(decoded).toEqual(cursor);
  });

  it("should roundtrip a cursor with all fields", () => {
    const cursor: PageCursor = {
      offset: 500,
      lastId: "z-99",
      sortValues: [1, "two"],
    };
    const decoded = decodePageToken(encodePageToken(cursor));
    expect(decoded).toEqual(cursor);
  });

  it("should throw on negative offset during encoding", () => {
    expect(() => encodePageToken({ offset: -1 })).toThrow(
      /non-negative/,
    );
  });

  it("should throw on empty token", () => {
    expect(() => decodePageToken("" as PageToken)).toThrow(/empty/);
  });

  it("should throw on invalid base64url token", () => {
    expect(() => decodePageToken("!!not-valid!!" as PageToken)).toThrow(
      /Invalid page token/,
    );
  });

  it("should throw on valid base64 but non-JSON content", () => {
    const token = btoa("not json") as PageToken;
    expect(() => decodePageToken(token)).toThrow(/not valid JSON/);
  });

  it("should throw on valid JSON that is not an object", () => {
    const token = btoa(JSON.stringify([1, 2, 3])) as PageToken;
    expect(() => decodePageToken(token)).toThrow(/must be an object/);
  });

  it("should throw on cursor missing offset", () => {
    const token = btoa(JSON.stringify({ lastId: "x" })) as PageToken;
    expect(() => decodePageToken(token)).toThrow(/offset/);
  });
});

// ---------------------------------------------------------------------------
// normalizePageRequest
// ---------------------------------------------------------------------------

describe("normalizePageRequest", () => {
  it("should use defaults when called with no arguments", () => {
    const result = normalizePageRequest();
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.pageToken).toBeUndefined();
  });

  it("should use defaults for empty object", () => {
    const result = normalizePageRequest({});
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("should preserve a valid pageSize", () => {
    const result = normalizePageRequest({ pageSize: 50 });
    expect(result.pageSize).toBe(50);
  });

  it("should clamp pageSize to minimum of 1", () => {
    expect(normalizePageRequest({ pageSize: 0 }).pageSize).toBe(1);
    expect(normalizePageRequest({ pageSize: -10 }).pageSize).toBe(1);
  });

  it("should clamp pageSize to MAX_PAGE_SIZE", () => {
    expect(
      normalizePageRequest({ pageSize: MAX_PAGE_SIZE + 1 }).pageSize,
    ).toBe(MAX_PAGE_SIZE);
    expect(
      normalizePageRequest({ pageSize: 999_999 }).pageSize,
    ).toBe(MAX_PAGE_SIZE);
  });

  it("should floor fractional pageSize", () => {
    expect(normalizePageRequest({ pageSize: 10.9 }).pageSize).toBe(10);
  });

  it("should preserve pageToken when provided", () => {
    const token = encodePageToken({ offset: 10 });
    const result = normalizePageRequest({ pageToken: token });
    expect(result.pageToken).toBe(token);
  });
});

// ---------------------------------------------------------------------------
// createPageResponse
// ---------------------------------------------------------------------------

describe("createPageResponse", () => {
  it("should return data without nextPageToken when items fit in one page", () => {
    const items = [1, 2, 3];
    const response = createPageResponse(items, { offset: 0 }, 5);
    expect(response.data).toEqual([1, 2, 3]);
    expect(response.nextPageToken).toBeUndefined();
  });

  it("should return data with nextPageToken when items exceed pageSize", () => {
    // Simulate fetching pageSize+1 items to detect next page
    const items = [1, 2, 3, 4, 5, 6];
    const response = createPageResponse(items, { offset: 0 }, 5);
    expect(response.data).toEqual([1, 2, 3, 4, 5]);
    expect(response.nextPageToken).toBeDefined();

    const nextCursor = decodePageToken(response.nextPageToken!);
    expect(nextCursor.offset).toBe(5);
  });

  it("should include totalCount when provided", () => {
    const response = createPageResponse([1, 2], { offset: 0 }, 10, 42);
    expect(response.totalCount).toBe(42);
  });

  it("should not include totalCount when not provided", () => {
    const response = createPageResponse([1, 2], { offset: 0 }, 10);
    expect(response.totalCount).toBeUndefined();
  });

  it("should handle exact pageSize items (no next page)", () => {
    const items = [1, 2, 3];
    const response = createPageResponse(items, { offset: 0 }, 3);
    expect(response.data).toEqual([1, 2, 3]);
    expect(response.nextPageToken).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// paginate & collectAll
// ---------------------------------------------------------------------------

describe("paginate", () => {
  it("should iterate across multiple pages", async () => {
    const pages: PageResponse<number>[] = [
      {
        data: [1, 2],
        nextPageToken: encodePageToken({ offset: 2 }),
      },
      {
        data: [3, 4],
        nextPageToken: encodePageToken({ offset: 4 }),
      },
      { data: [5] },
    ];

    let callIndex = 0;
    const fetcher = async (_token?: PageToken): Promise<PageResponse<number>> => {
      return pages[callIndex++]!;
    };

    const items: number[] = [];
    for await (const item of paginate(fetcher)) {
      items.push(item);
    }
    expect(items).toEqual([1, 2, 3, 4, 5]);
    expect(callIndex).toBe(3);
  });

  it("should handle a single page with no nextPageToken", async () => {
    const fetcher = async (): Promise<PageResponse<string>> => ({
      data: ["a", "b"],
    });

    const items = await collectAll(paginate(fetcher));
    expect(items).toEqual(["a", "b"]);
  });

  it("should handle an empty first page", async () => {
    const fetcher = async (): Promise<PageResponse<string>> => ({
      data: [],
    });

    const items = await collectAll(paginate(fetcher));
    expect(items).toEqual([]);
  });
});

describe("collectAll", () => {
  it("should respect the limit parameter", async () => {
    const pages: PageResponse<number>[] = [
      {
        data: [1, 2, 3],
        nextPageToken: encodePageToken({ offset: 3 }),
      },
      { data: [4, 5, 6] },
    ];

    let callIndex = 0;
    const fetcher = async (): Promise<PageResponse<number>> =>
      pages[callIndex++]!;

    const items = await collectAll(paginate(fetcher), 4);
    expect(items).toEqual([1, 2, 3, 4]);
  });

  it("should return all items when limit exceeds total", async () => {
    const fetcher = async (): Promise<PageResponse<number>> => ({
      data: [1, 2],
    });

    const items = await collectAll(paginate(fetcher), 100);
    expect(items).toEqual([1, 2]);
  });
});
