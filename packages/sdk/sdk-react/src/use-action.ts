import { useState, useCallback } from "react";
import { useOpenFoundry } from "./context.js";

export interface UseActionResult {
  apply: (params: Record<string, unknown>) => Promise<unknown>;
  loading: boolean;
  error: Error | null;
  result: unknown | null;
}

/**
 * Hook for executing an action on the OpenFoundry platform.
 * Returns an `apply` function that can be called with action parameters.
 */
export function useAction(
  ontologyRid: string,
  actionApiName: string,
): UseActionResult {
  const { baseUrl, token, tokenProvider } = useOpenFoundry();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<unknown | null>(null);

  const apply = useCallback(
    async (params: Record<string, unknown>): Promise<unknown> => {
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        let resolvedToken = token;
        if (!resolvedToken && tokenProvider) {
          resolvedToken = await tokenProvider();
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (resolvedToken) {
          headers["Authorization"] = `Bearer ${resolvedToken}`;
        }

        const url = `${baseUrl.replace(/\/$/, "")}/api/v2/ontologies/${encodeURIComponent(ontologyRid)}/actions/${encodeURIComponent(actionApiName)}/apply`;

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ parameters: params }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json: unknown = await response.json();
        setResult(json);
        return json;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
        throw wrapped;
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, token, tokenProvider, ontologyRid, actionApiName],
  );

  return { apply, loading, error, result };
}
