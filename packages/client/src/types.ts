import type { BearerToken } from "@openfoundry/auth-tokens";

/**
 * A function with the same signature as the global `fetch`.
 * Each middleware layer wraps a FetchFn and returns a new FetchFn.
 */
export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Provides a BearerToken for authenticating requests.
 * May be async to support token refresh flows.
 */
export type TokenProvider = () => BearerToken | Promise<BearerToken>;

/**
 * Options for creating an OpenFoundry client.
 */
export interface ClientOptions {
  /** Base URL of the OpenFoundry instance (e.g. "https://myorg.openfoundry.com"). */
  baseUrl: string;

  /** Provides the bearer token for authentication. */
  tokenProvider: TokenProvider;

  /** Optional custom fetch implementation. Defaults to globalThis.fetch. */
  fetch?: FetchFn;

  /** Maximum number of retries for retryable status codes. Defaults to 3. */
  maxRetries?: number;

  /** Base delay in ms for retry backoff. Defaults to 1000. */
  retryBaseDelayMs?: number;
}

/**
 * Options for individual requests.
 */
export interface RequestOptions {
  /** Additional headers to merge into the request. */
  headers?: Record<string, string>;

  /** AbortSignal for cancellation. */
  signal?: AbortSignal;

  /** Request body (JSON-serializable or raw). */
  body?: unknown;

  /** Query parameters to append to the URL. */
  queryParams?: Record<string, string | string[] | undefined>;
}

/**
 * HTTP method type.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Content type identifiers used in endpoint descriptors.
 */
export type ContentType = "application/json" | "application/octet-stream" | "multipart/form-data" | "*/*";

/**
 * Flags for endpoint behavior.
 */
export interface EndpointFlags {
  /** Whether the endpoint is preview/unstable. */
  preview?: boolean;
}

/**
 * A descriptor tuple that fully describes an API endpoint.
 *
 * [method, path, flags, requestContentType, responseContentType]
 *
 * Example: ["POST", "/ontology/objects/search", {}, "application/json", "application/json"]
 */
export type EndpointDescriptor = [
  method: HttpMethod,
  path: string,
  flags: EndpointFlags,
  requestContentType: ContentType,
  responseContentType: ContentType,
];

/**
 * The composable OpenFoundry client.
 */
export interface Client {
  /** The composed fetch function with all middleware layers applied. */
  fetch: FetchFn;

  /** The base URL of the OpenFoundry instance. */
  baseUrl: string;
}
