import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../config";

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Maximum number of retries for GET requests. */
const MAX_RETRIES = 2;

/** Delay between retries in ms. */
const RETRY_DELAY = 1000;

/** Request timeout in ms. */
const REQUEST_TIMEOUT = 30_000;

/**
 * Determine whether the request method is GET (or unspecified, which defaults to GET).
 */
function isGetRequest(options?: RequestInit): boolean {
  return !options?.method || options.method.toUpperCase() === "GET";
}

/**
 * Create a user-friendly error message from a fetch failure.
 */
function formatError(err: unknown, status?: number): Error {
  if (err instanceof DOMException && err.name === "AbortError") {
    return new Error("Request timed out. Please try again.");
  }
  if (err instanceof TypeError) {
    // TypeError is thrown by fetch for network-level failures
    return new Error(
      "Network error: Unable to reach the server. Check your connection and try again.",
    );
  }
  if (status !== undefined) {
    if (status >= 500) {
      return new Error(
        `Server error (HTTP ${status}). The server encountered an issue — please try again later.`,
      );
    }
    if (status === 404) {
      return new Error("The requested resource was not found (HTTP 404).");
    }
    if (status === 403) {
      return new Error(
        "Access denied (HTTP 403). You may not have permission to view this resource.",
      );
    }
    if (status === 401) {
      return new Error(
        "Authentication required (HTTP 401). Please log in and try again.",
      );
    }
    return new Error(`Request failed with HTTP ${status}.`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Perform a single fetch with an AbortSignal-based timeout.
 */
async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Simple data-fetching hook that calls the API gateway.
 *
 * Features:
 * - Automatic retry (up to 2 retries) for GET requests on network/server errors
 * - 30-second request timeout
 * - Friendly error messages for common failure modes
 *
 * @param url  Relative URL path (e.g. "/api/v2/ontologies").
 * @param options  Optional RequestInit overrides.
 */
export function useApi<T>(
  url: string,
  options?: RequestInit,
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      const fullUrl = `${API_BASE_URL}${url}`;
      const reqOptions: RequestInit = {
        headers: { "Content-Type": "application/json" },
        ...options,
      };

      const shouldRetry = isGetRequest(options);
      const attempts = shouldRetry ? MAX_RETRIES + 1 : 1;

      for (let attempt = 0; attempt < attempts; attempt++) {
        if (cancelled) return;

        try {
          const res = await fetchWithTimeout(fullUrl, reqOptions);

          if (!res.ok) {
            // Don't retry client errors (4xx) — only server errors (5xx)
            if (res.status < 500 || attempt >= attempts - 1) {
              if (!cancelled) {
                setError(formatError(null, res.status));
                setLoading(false);
              }
              return;
            }
            // Server error — fall through to retry logic below
            throw new Error(`HTTP ${res.status}`);
          }

          const json = (await res.json()) as T;
          if (!cancelled) {
            setData(json);
            setLoading(false);
          }
          return;
        } catch (err) {
          // Last attempt — report the error
          if (attempt >= attempts - 1) {
            if (!cancelled) {
              setError(formatError(err));
              setLoading(false);
            }
            return;
          }

          // Wait before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, RETRY_DELAY),
          );
        }
      }
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick]);

  return { data, loading, error, refetch };
}
