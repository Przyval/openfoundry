import { useFetch } from "./use-fetch.js";

export interface UseObjectsOptions {
  pageSize?: number;
  pageToken?: string;
  enabled?: boolean;
}

export interface UseObjectsResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  nextPageToken?: string;
  refetch: () => void;
}

interface ListObjectsApiResponse<T> {
  data: T[];
  nextPageToken?: string;
}

/**
 * Fetch a paginated list of objects from the specified ontology and object type.
 */
export function useObjects<T = Record<string, unknown>>(
  ontologyRid: string,
  objectType: string,
  options?: UseObjectsOptions,
): UseObjectsResult<T> {
  const params = new URLSearchParams();
  if (options?.pageSize !== undefined) {
    params.set("pageSize", String(options.pageSize));
  }
  if (options?.pageToken !== undefined) {
    params.set("pageToken", options.pageToken);
  }

  const query = params.toString();
  const url = `/api/v2/ontologies/${encodeURIComponent(ontologyRid)}/objects/${encodeURIComponent(objectType)}${query ? `?${query}` : ""}`;

  const result = useFetch<ListObjectsApiResponse<T>>(url, {
    enabled: options?.enabled,
  });

  return {
    data: result.data?.data ?? [],
    loading: result.loading,
    error: result.error,
    nextPageToken: result.data?.nextPageToken,
    refetch: result.refetch,
  };
}
