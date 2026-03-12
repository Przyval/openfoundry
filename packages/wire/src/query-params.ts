/**
 * Query parameter serialization for Conjure HTTP endpoints.
 */

/**
 * Serializes a single query parameter value to its string representation.
 *
 * - undefined/null: returns empty string
 * - Date: ISO 8601
 * - Array: comma-separated values
 * - Object: JSON stringified
 * - Primitives: String()
 */
export function serializeQueryParam(key: string, value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Date) {
    return `${encodeURIComponent(key)}=${encodeURIComponent(value.toISOString())}`;
  }

  if (Array.isArray(value)) {
    return value
      .map(
        (item) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`,
      )
      .join("&");
  }

  if (typeof value === "object") {
    return `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`;
  }

  return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}

/**
 * Builds a URL query string from a params record.
 * Omits entries whose value is undefined.
 * Returns the query string without a leading "?".
 */
export function buildQueryString(params: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    const serialized = serializeQueryParam(key, value);
    if (serialized !== "") {
      parts.push(serialized);
    }
  }

  return parts.join("&");
}
