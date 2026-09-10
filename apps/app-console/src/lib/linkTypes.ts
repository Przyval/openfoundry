import { API_BASE_URL } from "../config";
import { apiErrorMessage } from "./apiError";

export interface LinkTypeDef {
  apiName: string;
  displayName?: string;
  objectTypeApiName?: string;
}

/**
 * An object type with no outgoing links and a lookup that never answered are
 * different facts, so the caller is handed one or the other, never an empty
 * list standing in for both.
 */
export type OutgoingLinkTypesResult =
  | { ok: true; linkTypes: LinkTypeDef[] }
  | { ok: false; error: string };

export async function fetchOutgoingLinkTypes(
  ontologyRid: string,
  objectType: string,
  authToken: string | null,
): Promise<OutgoingLinkTypesResult> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectTypes/${objectType}/outgoingLinkTypes`,
      authToken
        ? { headers: { Authorization: `Bearer ${authToken}` } }
        : undefined,
    );
    if (!res.ok) {
      return { ok: false, error: await apiErrorMessage(res) };
    }
    const body = (await res.json()) as { data?: LinkTypeDef[] };
    return { ok: true, linkTypes: body.data ?? [] };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
