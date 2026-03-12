import { useState, useCallback } from "react";
import { useOpenFoundry } from "./context.js";

export interface UseUpdateObjectResult<T> {
  update: (properties: Record<string, unknown>) => Promise<T>;
  isLoading: boolean;
  error: Error | null;
  result: T | null;
}

/**
 * Hook for updating an existing object by its primary key.
 * PUTs to /api/v2/ontologies/{rid}/objects/{type}/{pk}.
 */
export function useUpdateObject<T = Record<string, unknown>>(
  ontologyRid: string,
  objectType: string,
  primaryKey: string,
): UseUpdateObjectResult<T> {
  const { baseUrl, token, tokenProvider } = useOpenFoundry();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<T | null>(null);

  const update = useCallback(
    async (properties: Record<string, unknown>): Promise<T> => {
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

        const url = `${baseUrl.replace(/\/$/, "")}/api/v2/ontologies/${encodeURIComponent(ontologyRid)}/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(primaryKey)}`;

        const response = await fetch(url, {
          method: "PUT",
          headers,
          body: JSON.stringify(properties),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = (await response.json()) as T;
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
    [baseUrl, token, tokenProvider, ontologyRid, objectType, primaryKey],
  );

  return { update, isLoading, error, result };
}
