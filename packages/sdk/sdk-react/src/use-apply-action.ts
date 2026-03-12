import { useState, useCallback } from "react";
import { useOpenFoundry } from "./context.js";

export interface UseApplyActionResult {
  apply: (actionApiName: string, parameters: Record<string, unknown>) => Promise<unknown>;
  isLoading: boolean;
  error: Error | null;
  result: unknown | null;
}

/**
 * Hook for executing actions on the OpenFoundry platform.
 * Unlike `useAction` which is bound to a specific action name, this hook
 * accepts the action name at call-time, making it suitable for dynamic
 * action invocation.
 *
 * POSTs to /api/v2/ontologies/{rid}/actions/{action}/apply.
 */
export function useApplyAction(
  ontologyRid: string,
): UseApplyActionResult {
  const { baseUrl, token, tokenProvider } = useOpenFoundry();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<unknown | null>(null);

  const apply = useCallback(
    async (actionApiName: string, parameters: Record<string, unknown>): Promise<unknown> => {
      setIsLoading(true);
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
          body: JSON.stringify({ parameters }),
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
        setIsLoading(false);
      }
    },
    [baseUrl, token, tokenProvider, ontologyRid],
  );

  return { apply, isLoading, error, result };
}
