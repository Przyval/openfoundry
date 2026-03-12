import { useFetch } from "./use-fetch.js";
import type { UseFetchResult } from "./use-fetch.js";

export interface UseObjectOptions {
  enabled?: boolean;
}

/**
 * Fetch a single object by its primary key from the specified ontology
 * and object type.
 */
export function useObject<T = Record<string, unknown>>(
  ontologyRid: string,
  objectType: string,
  primaryKey: string,
  options?: UseObjectOptions,
): UseFetchResult<T> {
  const url = `/api/v2/ontologies/${encodeURIComponent(ontologyRid)}/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(primaryKey)}`;
  return useFetch<T>(url, { enabled: options?.enabled });
}
