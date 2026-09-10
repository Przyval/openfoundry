import { invalidArgument } from "@openfoundry/errors";
import {
  type PageToken,
  type PageCursor,
  normalizePageRequest,
  decodePageToken,
  createPageResponse,
  type PageResponse,
} from "@openfoundry/pagination";

/**
 * Parse a `pageSize` query parameter.
 *
 * A value that is not a positive integer is a client mistake: left alone it
 * reaches `normalizePageRequest` as NaN and silently yields an empty page.
 */
function parsePageSize(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw invalidArgument("pageSize", `must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

/** Decode a caller-supplied page token, reporting a bad one as a client error. */
function parsePageToken(token: PageToken): PageCursor {
  try {
    return decodePageToken(token);
  } catch (err) {
    throw invalidArgument(
      "pageToken",
      err instanceof Error ? err.message : "is not a valid page token",
    );
  }
}

/**
 * Parse pagination query parameters and apply pagination to an array of items.
 */
export function paginateArray<T>(
  items: T[],
  query: { pageSize?: string; pageToken?: string },
): PageResponse<T> {
  const req = normalizePageRequest({
    pageSize: parsePageSize(query.pageSize),
    pageToken: query.pageToken as PageToken | undefined,
  });

  const cursor: PageCursor = req.pageToken
    ? parsePageToken(req.pageToken)
    : { offset: 0 };

  // Slice items from offset, take one extra to detect next page
  const slice = items.slice(cursor.offset, cursor.offset + req.pageSize + 1);

  return createPageResponse(slice, cursor, req.pageSize);
}
