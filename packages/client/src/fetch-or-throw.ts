import { OpenFoundryApiError } from "@openfoundry/errors";
import type { FetchFn } from "./types.js";

/**
 * Layer 3: Converts non-2xx responses into `OpenFoundryApiError` exceptions.
 *
 * Attempts to parse the response body as a JSON error envelope. If parsing
 * fails, creates an error from the status code alone.
 */
export function createFetchOrThrow(innerFetch: FetchFn): FetchFn {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await innerFetch(input, init);

    if (response.ok) {
      return response;
    }

    // Attempt to parse the error body
    let body: Record<string, unknown> | undefined;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch {
      // Body may not be JSON — that's fine, we'll derive error from status
    }

    throw OpenFoundryApiError.fromResponse({
      status: response.status,
      body: body as {
        errorCode?: string;
        errorName?: string;
        errorInstanceId?: string;
        parameters?: Record<string, unknown>;
      },
    });
  };
}
