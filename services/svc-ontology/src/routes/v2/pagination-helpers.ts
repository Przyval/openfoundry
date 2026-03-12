import {
  type PageToken,
  type PageCursor,
  normalizePageRequest,
  decodePageToken,
  createPageResponse,
  type PageResponse,
} from "@openfoundry/pagination";

/**
 * Parse pagination query parameters and apply pagination to an array of items.
 */
export function paginateArray<T>(
  items: T[],
  query: { pageSize?: string; pageToken?: string },
): PageResponse<T> {
  const req = normalizePageRequest({
    pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    pageToken: query.pageToken as PageToken | undefined,
  });

  const cursor: PageCursor = req.pageToken
    ? decodePageToken(req.pageToken)
    : { offset: 0 };

  // Slice items from offset, take one extra to detect next page
  const slice = items.slice(cursor.offset, cursor.offset + req.pageSize + 1);

  return createPageResponse(slice, cursor, req.pageSize);
}
