import { useFetch } from "./use-fetch.js";

export interface UseOntologyResult {
  data: unknown | null;
  loading: boolean;
  error: Error | null;
}

export interface UseObjectTypesResult {
  data: unknown[];
  loading: boolean;
  error: Error | null;
}

interface ListApiResponse {
  data: unknown[];
}

/**
 * Fetch ontology metadata by its RID.
 */
export function useOntology(ontologyRid: string): UseOntologyResult {
  const url = `/api/v2/ontologies/${encodeURIComponent(ontologyRid)}`;
  return useFetch<unknown>(url);
}

/**
 * Fetch the list of object types defined in an ontology.
 */
export function useObjectTypes(ontologyRid: string): UseObjectTypesResult {
  const url = `/api/v2/ontologies/${encodeURIComponent(ontologyRid)}/objectTypes`;
  const result = useFetch<ListApiResponse>(url);

  return {
    data: result.data?.data ?? [],
    loading: result.loading,
    error: result.error,
  };
}
