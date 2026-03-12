/**
 * Request/response body serialization with Conjure wire rules.
 */

const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Serializes a request body to JSON string following Conjure rules.
 *
 * - Dates are converted to ISO 8601 strings.
 * - undefined returns undefined (no body).
 * - null serializes to "null".
 */
export function serializeRequestBody(body: unknown): string | undefined {
  if (body === undefined) {
    return undefined;
  }

  return JSON.stringify(body, (_key: string, value: unknown) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });
}

/**
 * Deserializes a JSON response body string, reviving ISO 8601 datetime strings
 * as Date objects.
 */
export function deserializeResponseBody<T>(text: string): T {
  return JSON.parse(text, (_key: string, value: unknown) => {
    if (typeof value === "string" && ISO_DATE_PATTERN.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  }) as T;
}
