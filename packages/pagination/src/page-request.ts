import type { PageToken } from "./page-token.js";

/** Default number of items per page when no pageSize is specified. */
export const DEFAULT_PAGE_SIZE = 100;

/** Maximum allowed page size to prevent excessive resource consumption. */
export const MAX_PAGE_SIZE = 10_000;

/**
 * A pagination request following the Foundry pageToken/pageSize pattern.
 */
export interface PageRequest {
  /** Number of items to return per page. Defaults to {@link DEFAULT_PAGE_SIZE}. */
  pageSize?: number;
  /** Opaque token pointing to the next page of results. */
  pageToken?: PageToken;
}

/**
 * Normalize a partial page request into a fully resolved request.
 *
 * - Missing `pageSize` defaults to {@link DEFAULT_PAGE_SIZE}.
 * - `pageSize` is clamped to the range `[1, MAX_PAGE_SIZE]`.
 * - Missing `pageToken` defaults to `undefined`.
 */
export function normalizePageRequest(
  req?: Partial<PageRequest>,
): Required<Pick<PageRequest, "pageSize">> & { pageToken: PageToken | undefined } {
  const raw = req?.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(raw)));

  return {
    pageSize,
    pageToken: req?.pageToken ?? undefined,
  };
}
