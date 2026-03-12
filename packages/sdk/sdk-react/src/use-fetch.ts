import { useState, useEffect, useCallback, useRef } from "react";
import { useOpenFoundry } from "./context.js";

export interface UseFetchOptions {
  method?: string;
  body?: unknown;
  enabled?: boolean;
}

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Internal fetch helper used by all hooks.
 * Builds the full URL from the OpenFoundry context baseUrl, attaches
 * the Bearer token (from context.token or context.tokenProvider), and
 * manages loading / error / data state.
 */
export function useFetch<T>(url: string, options?: UseFetchOptions): UseFetchResult<T> {
  const { baseUrl, token, tokenProvider } = useOpenFoundry();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const enabled = options?.enabled ?? true;
  const method = options?.method ?? "GET";
  const body = options?.body;

  // Keep a ref to the latest abort controller so we can cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    async function doFetch(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        // Resolve the auth token
        let resolvedToken = token;
        if (!resolvedToken && tokenProvider) {
          resolvedToken = await tokenProvider();
        }

        const headers: Record<string, string> = {};
        if (resolvedToken) {
          headers["Authorization"] = `Bearer ${resolvedToken}`;
        }
        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
        }

        const fullUrl = `${baseUrl.replace(/\/$/, "")}${url}`;

        const response = await fetch(fullUrl, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = (await response.json()) as T;
        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void doFetch();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [baseUrl, token, tokenProvider, url, method, body, enabled, fetchCount]);

  return { data, loading, error, refetch };
}
