import { describe, it, expect, vi, beforeEach } from "vitest";
import { BearerToken } from "@openfoundry/auth-tokens";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { createClient } from "../src/client.js";
import { createFetchHeaderMutator } from "../src/header-mutator.js";
import { createRetryingFetch } from "../src/retrying-fetch.js";
import { createFetchOrThrow } from "../src/fetch-or-throw.js";
import { foundryPlatformFetch } from "../src/platform-fetch.js";
import type { FetchFn, EndpointDescriptor } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  const responseHeaders = new Headers(headers);
  if (body !== undefined && !responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/json");
  }
  return new Response(
    body !== undefined ? JSON.stringify(body) : null,
    { status, headers: responseHeaders },
  );
}

function createMockFetch(responses: Response[]): FetchFn {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return response;
  });
}

const TEST_TOKEN = new BearerToken("test-token-value");
const tokenProvider = () => TEST_TOKEN;

// ---------------------------------------------------------------------------
// createFetchHeaderMutator
// ---------------------------------------------------------------------------

describe("createFetchHeaderMutator", () => {
  it("adds Authorization header to requests", async () => {
    const inner = vi.fn(async () => mockResponse(200, { ok: true }));
    const fetcher = createFetchHeaderMutator(inner, tokenProvider);

    await fetcher("https://example.com/api/test");

    expect(inner).toHaveBeenCalledOnce();
    const [, init] = inner.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token-value");
  });

  it("preserves existing headers", async () => {
    const inner = vi.fn(async () => mockResponse(200));
    const fetcher = createFetchHeaderMutator(inner, tokenProvider);

    await fetcher("https://example.com/api/test", {
      headers: { "X-Custom": "value" },
    });

    const [, init] = inner.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Custom")).toBe("value");
    expect(headers.get("Authorization")).toBe("Bearer test-token-value");
  });

  it("supports async token providers", async () => {
    const asyncProvider = async () => new BearerToken("async-token");
    const inner = vi.fn(async () => mockResponse(200));
    const fetcher = createFetchHeaderMutator(inner, asyncProvider);

    await fetcher("https://example.com/api/test");

    const [, init] = inner.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer async-token");
  });
});

// ---------------------------------------------------------------------------
// createRetryingFetch
// ---------------------------------------------------------------------------

describe("createRetryingFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns immediately on success", async () => {
    const inner = vi.fn(async () => mockResponse(200, { ok: true }));
    const fetcher = createRetryingFetch(inner, { maxRetries: 3 });

    const response = await fetcher("https://example.com/test");
    expect(response.status).toBe(200);
    expect(inner).toHaveBeenCalledOnce();
  });

  it("does not retry non-retryable status codes", async () => {
    const inner = vi.fn(async () => mockResponse(400, { error: "bad request" }));
    const fetcher = createRetryingFetch(inner, { maxRetries: 3 });

    const response = await fetcher("https://example.com/test");
    expect(response.status).toBe(400);
    expect(inner).toHaveBeenCalledOnce();
  });

  it("retries on 429 and eventually succeeds", async () => {
    const inner = createMockFetch([
      mockResponse(429),
      mockResponse(429),
      mockResponse(200, { ok: true }),
    ]);

    const fetcher = createRetryingFetch(inner, {
      maxRetries: 3,
      baseDelayMs: 10, // Use small delays for tests
    });

    vi.useRealTimers();
    const response = await fetcher("https://example.com/test");
    expect(response.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("retries on 503 and returns last response after exhausting retries", async () => {
    const inner = createMockFetch([
      mockResponse(503),
      mockResponse(503),
      mockResponse(503),
      mockResponse(503),
    ]);

    const fetcher = createRetryingFetch(inner, {
      maxRetries: 3,
      baseDelayMs: 10,
    });

    vi.useRealTimers();
    const response = await fetcher("https://example.com/test");
    expect(response.status).toBe(503);
    expect(inner).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });
});

// ---------------------------------------------------------------------------
// createFetchOrThrow
// ---------------------------------------------------------------------------

describe("createFetchOrThrow", () => {
  it("returns response on 2xx", async () => {
    const inner = vi.fn(async () => mockResponse(200, { data: "hello" }));
    const fetcher = createFetchOrThrow(inner);

    const response = await fetcher("https://example.com/test");
    expect(response.status).toBe(200);
  });

  it("throws OpenFoundryApiError on 4xx", async () => {
    const inner = vi.fn(async () => mockResponse(404, {
      errorCode: "NOT_FOUND",
      errorName: "ObjectNotFound",
      errorInstanceId: "abc-123",
      parameters: { objectId: "123" },
    }));
    const fetcher = createFetchOrThrow(inner);

    await expect(fetcher("https://example.com/test")).rejects.toThrow(OpenFoundryApiError);

    try {
      await fetcher("https://example.com/test");
    } catch (e) {
      const err = e as OpenFoundryApiError;
      expect(err.statusCode).toBe(404);
      expect(err.errorName).toBe("ObjectNotFound");
    }
  });

  it("throws OpenFoundryApiError on 5xx with non-JSON body", async () => {
    const inner = vi.fn(async () => new Response("Internal Server Error", { status: 500 }));
    const fetcher = createFetchOrThrow(inner);

    await expect(fetcher("https://example.com/test")).rejects.toThrow(OpenFoundryApiError);
  });
});

// ---------------------------------------------------------------------------
// createClient — full integration
// ---------------------------------------------------------------------------

describe("createClient", () => {
  it("creates a client with all layers composed", () => {
    const client = createClient({
      baseUrl: "https://myorg.openfoundry.com",
      tokenProvider,
      fetch: async () => mockResponse(200),
    });

    expect(client.baseUrl).toBe("https://myorg.openfoundry.com");
    expect(typeof client.fetch).toBe("function");
  });

  it("normalizes trailing slash in baseUrl", () => {
    const client = createClient({
      baseUrl: "https://myorg.openfoundry.com/",
      tokenProvider,
      fetch: async () => mockResponse(200),
    });

    expect(client.baseUrl).toBe("https://myorg.openfoundry.com");
  });

  it("sends authenticated requests through all layers", async () => {
    const inner = vi.fn(async () => mockResponse(200, { result: "ok" }));

    const client = createClient({
      baseUrl: "https://myorg.openfoundry.com",
      tokenProvider,
      fetch: inner,
    });

    const response = await client.fetch("https://myorg.openfoundry.com/api/v1/test");
    expect(response.ok).toBe(true);

    const [, init] = inner.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-token-value");
  });

  it("retries and then throws on persistent 429", async () => {
    vi.useRealTimers();
    const inner = createMockFetch([
      mockResponse(429),
      mockResponse(429),
      mockResponse(429),
      mockResponse(429),
    ]);

    const client = createClient({
      baseUrl: "https://myorg.openfoundry.com",
      tokenProvider,
      fetch: inner,
      maxRetries: 3,
      retryBaseDelayMs: 10,
    });

    // After retries exhausted, fetch-or-throw layer converts 429 to an error
    await expect(client.fetch("https://example.com/test")).rejects.toThrow(OpenFoundryApiError);
  });
});

// ---------------------------------------------------------------------------
// foundryPlatformFetch
// ---------------------------------------------------------------------------

describe("foundryPlatformFetch", () => {
  it("builds URL from descriptor and sends request", async () => {
    const inner = vi.fn(async () => mockResponse(200, { employees: [] }));

    const client = createClient({
      baseUrl: "https://myorg.openfoundry.com",
      tokenProvider,
      fetch: inner,
    });

    const descriptor: EndpointDescriptor = [
      "POST",
      "/v1/ontology/objects/search",
      {},
      "application/json",
      "application/json",
    ];

    const result = await foundryPlatformFetch(client, descriptor, {
      body: { query: "test" },
    });

    expect(result).toEqual({ employees: [] });

    const [url, init] = inner.mock.calls[0];
    expect(url).toContain("api/v1/ontology/objects/search");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ query: "test" });
  });

  it("appends query parameters to URL", async () => {
    const inner = vi.fn(async () => mockResponse(200, { items: [] }));

    const client = createClient({
      baseUrl: "https://myorg.openfoundry.com",
      tokenProvider,
      fetch: inner,
    });

    const descriptor: EndpointDescriptor = [
      "GET",
      "/v1/objects",
      {},
      "application/json",
      "application/json",
    ];

    await foundryPlatformFetch(client, descriptor, {
      queryParams: { pageSize: "100", filter: "active" },
    });

    const [url] = inner.mock.calls[0];
    expect(url).toContain("pageSize=100");
    expect(url).toContain("filter=active");
  });

  it("sets correct Content-Type and Accept headers", async () => {
    const inner = vi.fn(async () => mockResponse(200, {}));

    const client = createClient({
      baseUrl: "https://myorg.openfoundry.com",
      tokenProvider,
      fetch: inner,
    });

    const descriptor: EndpointDescriptor = [
      "POST",
      "/v1/data/upload",
      {},
      "application/octet-stream",
      "application/json",
    ];

    await foundryPlatformFetch(client, descriptor, {
      body: new Blob(["data"]),
    });

    const [, init] = inner.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/octet-stream");
    expect(headers.get("Accept")).toBe("application/json");
  });
});
