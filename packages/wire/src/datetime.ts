/**
 * ISO 8601 datetime wire format handling.
 *
 * Conjure uses ISO 8601 strings with millisecond precision for datetime values.
 */

/** ISO 8601 datetime pattern: YYYY-MM-DDTHH:mm:ss.sssZ or with timezone offset. */
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Converts a Date to an ISO 8601 string with millisecond precision.
 * Always uses UTC (Z suffix).
 */
export function toWireDatetime(date: Date): string {
  return date.toISOString();
}

/**
 * Parses an ISO 8601 datetime string into a Date.
 * Throws if the string is not a valid ISO 8601 datetime.
 */
export function fromWireDatetime(wire: string): Date {
  if (!isValidWireDatetime(wire)) {
    throw new Error(`Invalid ISO 8601 datetime: ${wire}`);
  }
  const date = new Date(wire);
  if (isNaN(date.getTime())) {
    throw new Error(`Unable to parse datetime: ${wire}`);
  }
  return date;
}

/**
 * Returns true if the string matches the ISO 8601 datetime wire format.
 */
export function isValidWireDatetime(wire: string): boolean {
  return ISO_8601_PATTERN.test(wire);
}
