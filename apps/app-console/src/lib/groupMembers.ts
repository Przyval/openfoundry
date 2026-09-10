/**
 * How many members the Members dialog asks for in one page.
 *
 * At or below the server's MAX_PAGE_SIZE (10000), above which
 * `normalizePageRequest` clamps the request without saying so.
 */
export const MEMBERS_PAGE_SIZE = 1000;

/**
 * Warn that the rendered member list is only part of the membership.
 *
 * Returns null when the page is the whole list, so the dialog says nothing in
 * the ordinary case and never claims a truncated list is complete.
 */
export function describeMemberTruncation(
  shownCount: number,
  nextPageToken?: string,
): string | null {
  if (!nextPageToken) return null;
  return (
    `Showing the first ${shownCount} members; this group has more than that. ` +
    "Members beyond this page are not listed here and cannot be removed from this dialog."
  );
}
