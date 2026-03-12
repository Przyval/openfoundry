import type { Client, ClientOptions, FetchFn } from "./types.js";
import { createFetchHeaderMutator } from "./header-mutator.js";
import { createRetryingFetch } from "./retrying-fetch.js";
import { createFetchOrThrow } from "./fetch-or-throw.js";

/**
 * Creates an OpenFoundry client by composing four fetch middleware layers:
 *
 * 1. **Header mutator** (outermost) — injects the Bearer token
 * 2. **Retrying fetch** — retries 429/503 with exponential backoff + jitter
 * 3. **Fetch-or-throw** — converts non-2xx to OpenFoundryApiError
 * 4. **Raw fetch** (innermost) — the actual HTTP call
 *
 * Requests flow from layer 1 -> 2 -> 3 -> 4, responses flow back 4 -> 3 -> 2 -> 1.
 */
export function createClient(options: ClientOptions): Client {
  const {
    baseUrl,
    tokenProvider,
    maxRetries,
    retryBaseDelayMs,
  } = options;

  // Layer 4: raw fetch
  const rawFetch: FetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);

  // Layer 3: convert non-2xx to errors
  const throwingFetch = createFetchOrThrow(rawFetch);

  // Layer 2: retry on 429/503
  const retryingFetch = createRetryingFetch(throwingFetch, {
    maxRetries,
    baseDelayMs: retryBaseDelayMs,
  });

  // Layer 1: add Authorization header
  const authenticatedFetch = createFetchHeaderMutator(retryingFetch, tokenProvider);

  return {
    fetch: authenticatedFetch,
    baseUrl: normalizeBaseUrl(baseUrl),
  };
}

/**
 * Ensures the base URL has no trailing slash for consistent URL construction.
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}
