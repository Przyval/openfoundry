import { useState, useCallback } from "react";
import { useOpenFoundry } from "./context.js";

export interface UseDeleteObjectResult {
  remove: (primaryKey: string) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook for deleting an object by its primary key.
 * DELETEs /api/v2/ontologies/{rid}/objects/{type}/{pk}.
 */
export function useDeleteObject(
  ontologyRid: string,
  objectType: string,
): UseDeleteObjectResult {
  const { baseUrl, token, tokenProvider } = useOpenFoundry();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const remove = useCallback(
    async (primaryKey: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        let resolvedToken = token;
        if (!resolvedToken && tokenProvider) {
          resolvedToken = await tokenProvider();
        }

        const headers: Record<string, string> = {};
        if (resolvedToken) {
          headers["Authorization"] = `Bearer ${resolvedToken}`;
        }

        const url = `${baseUrl.replace(/\/$/, "")}/api/v2/ontologies/${encodeURIComponent(ontologyRid)}/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(primaryKey)}`;

        const response = await fetch(url, {
          method: "DELETE",
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setError(wrapped);
        throw wrapped;
      } finally {
        setIsLoading(false);
      }
    },
    [baseUrl, token, tokenProvider, ontologyRid, objectType],
  );

  return { remove, isLoading, error };
}
