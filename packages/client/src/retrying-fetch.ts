import type { FetchFn } from "./types.js";

export interface RetryOptions {
  /** Maximum number of retries. Defaults to 3. */
  maxRetries?: number;

  /** Base delay in milliseconds for exponential backoff. Defaults to 1000. */
  baseDelayMs?: number;

  /** Status codes that trigger a retry. Defaults to [429, 503]. */
  retryableStatusCodes?: number[];
}

const DEFAULT_RETRYABLE_STATUS_CODES = [429, 503];

/**
 * Layer 2: Retries requests on retryable status codes (429 Too Many Requests, 503 Service Unavailable).
 *
 * Uses exponential backoff with jitter: delay = baseDelay * 2^attempt + random jitter.
 * Respects the `Retry-After` header when present.
 */
export function createRetryingFetch(
  innerFetch: FetchFn,
  options: RetryOptions = {},
): FetchFn {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const retryableStatusCodes = options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // If this is a retry, wait with exponential backoff + jitter
      if (attempt > 0) {
        const delay = computeDelay(attempt - 1, baseDelayMs, lastResponse);
        await sleep(delay);
      }

      const response = await innerFetch(input, init);

      if (!retryableStatusCodes.includes(response.status)) {
        return response;
      }

      lastResponse = response;

      // If we've exhausted retries, return the last response as-is
      if (attempt === maxRetries) {
        return response;
      }
    }

    // Unreachable, but TypeScript needs it
    return lastResponse!;
  };
}

/**
 * Computes the delay for a given retry attempt using exponential backoff with jitter.
 *
 * If the response has a `Retry-After` header with a seconds value, that is used as the base.
 * Otherwise: baseDelay * 2^attempt + jitter (0 to baseDelay/2).
 */
function computeDelay(attempt: number, baseDelayMs: number, response?: Response): number {
  // Check for Retry-After header
  const retryAfter = response?.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds) && seconds > 0) {
      // Use Retry-After value plus small jitter
      const jitter = Math.random() * (baseDelayMs / 4);
      return seconds * 1000 + jitter;
    }
  }

  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Add jitter: random value between 0 and baseDelay/2
  const jitter = Math.random() * (baseDelayMs / 2);

  return exponentialDelay + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
