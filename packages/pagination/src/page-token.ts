/**
 * Opaque page token type used for cursor-based pagination.
 * Tokens are base64url-encoded JSON cursors.
 */
export type PageToken = string & { readonly __brand: "PageToken" };

/**
 * Internal cursor state encoded within a PageToken.
 */
export interface PageCursor {
  /** Zero-based offset into the result set. */
  offset: number;
  /** Optional ID of the last item on the previous page, for keyset pagination. */
  lastId?: string;
  /** Optional sort field values from the last item, for multi-column keyset pagination. */
  sortValues?: unknown[];
}

/**
 * Encode a PageCursor into an opaque PageToken (base64url-encoded JSON).
 *
 * @throws {TypeError} if the cursor offset is negative
 */
export function encodePageToken(cursor: PageCursor): PageToken {
  if (cursor.offset < 0) {
    throw new TypeError(
      `PageCursor offset must be non-negative, got ${cursor.offset}`,
    );
  }

  const json = JSON.stringify(cursor);
  const base64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return base64 as PageToken;
}

/**
 * Decode a PageToken back into a PageCursor.
 *
 * @throws {Error} if the token is empty, malformed, or contains an invalid cursor
 */
export function decodePageToken(token: PageToken): PageCursor {
  if (!token) {
    throw new Error("Page token must not be empty");
  }

  let json: string;
  try {
    // Restore base64 padding and standard characters
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    json = atob(padded);
  } catch {
    throw new Error(
      `Invalid page token: unable to decode base64url value "${token}"`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      `Invalid page token: decoded value is not valid JSON`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `Invalid page token: decoded value must be an object`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.offset !== "number" || !Number.isFinite(obj.offset)) {
    throw new Error(
      `Invalid page token: cursor must contain a finite numeric "offset" field`,
    );
  }

  if (obj.offset < 0) {
    throw new Error(
      `Invalid page token: cursor offset must be non-negative, got ${obj.offset}`,
    );
  }

  if (obj.lastId !== undefined && typeof obj.lastId !== "string") {
    throw new Error(
      `Invalid page token: "lastId" must be a string if present`,
    );
  }

  if (obj.sortValues !== undefined && !Array.isArray(obj.sortValues)) {
    throw new Error(
      `Invalid page token: "sortValues" must be an array if present`,
    );
  }

  return {
    offset: obj.offset,
    ...(obj.lastId !== undefined && { lastId: obj.lastId as string }),
    ...(obj.sortValues !== undefined && {
      sortValues: obj.sortValues as unknown[],
    }),
  };
}
