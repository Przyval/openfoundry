import { OpenFoundryApiError } from "@openfoundry/errors";

/**
 * Asserts that the given async function throws an {@link OpenFoundryApiError}
 * with the expected status code and optional error code.
 *
 * @param fn         - The async function expected to throw.
 * @param statusCode - The expected HTTP status code.
 * @param errorCode  - Optional expected error code string.
 */
export async function expectApiError(
  fn: () => Promise<unknown>,
  statusCode: number,
  errorCode?: string,
): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    if (!(err instanceof OpenFoundryApiError)) {
      throw new Error(
        `Expected OpenFoundryApiError but got ${err instanceof Error ? err.constructor.name : typeof err}: ${err}`,
      );
    }
    if (err.statusCode !== statusCode) {
      throw new Error(
        `Expected status code ${statusCode} but got ${err.statusCode}`,
      );
    }
    if (errorCode !== undefined && err.errorCode !== errorCode) {
      throw new Error(
        `Expected error code "${errorCode}" but got "${err.errorCode}"`,
      );
    }
  }

  if (!threw) {
    throw new Error(
      `Expected function to throw OpenFoundryApiError with status ${statusCode}, but it did not throw`,
    );
  }
}

/**
 * Asserts that a value is a valid RID string (matches `ri.<service>.<instance>.<type>.<locator>`).
 *
 * @param value   - The string to validate.
 * @param service - If provided, also asserts the service segment matches.
 */
export function expectRid(value: string, service?: string): void {
  const RID_PATTERN = /^ri\.[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+\.[a-zA-Z0-9._-]+$/;

  if (typeof value !== "string") {
    throw new Error(`Expected a string RID, got ${typeof value}`);
  }

  if (!RID_PATTERN.test(value)) {
    throw new Error(
      `Expected value to be a valid RID (ri.<service>.<instance>.<type>.<locator>), got "${value}"`,
    );
  }

  if (service !== undefined) {
    const parts = value.split(".");
    if (parts[1] !== service) {
      throw new Error(
        `Expected RID service segment to be "${service}", got "${parts[1]}" in "${value}"`,
      );
    }
  }
}
