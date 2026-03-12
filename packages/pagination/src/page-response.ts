import type { PageToken, PageCursor } from "./page-token.js";
import { encodePageToken } from "./page-token.js";

/**
 * A paginated response following the Foundry nextPageToken pattern.
 */
export interface PageResponse<T> {
  /** The items on this page. */
  data: T[];
  /** Token for fetching the next page, absent when there are no more results. */
  nextPageToken?: PageToken;
  /** Optional total count of items across all pages. */
  totalCount?: number;
}

/**
 * Build a {@link PageResponse} from a set of candidate items.
 *
 * If `items.length > pageSize`, the extra items are trimmed and a
 * `nextPageToken` is generated pointing to the next page.
 *
 * @param items - The candidate items (may contain one extra to detect a next page).
 * @param cursor - The current cursor position used to compute the next cursor offset.
 * @param pageSize - The requested page size.
 * @param totalCount - Optional total number of items across all pages.
 */
export function createPageResponse<T>(
  items: T[],
  cursor: PageCursor,
  pageSize: number,
  totalCount?: number,
): PageResponse<T> {
  const hasMore = items.length > pageSize;
  const data = hasMore ? items.slice(0, pageSize) : items;

  const response: PageResponse<T> = { data };

  if (hasMore) {
    const nextCursor: PageCursor = {
      offset: cursor.offset + pageSize,
      ...(cursor.lastId !== undefined && { lastId: cursor.lastId }),
      ...(cursor.sortValues !== undefined && {
        sortValues: cursor.sortValues,
      }),
    };
    response.nextPageToken = encodePageToken(nextCursor);
  }

  if (totalCount !== undefined) {
    response.totalCount = totalCount;
  }

  return response;
}
