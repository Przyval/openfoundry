/**
 * SafeLong — numbers that are safe for JSON serialization.
 *
 * JSON numbers are IEEE 754 doubles, so integers outside the safe range
 * will lose precision when parsed by standard JSON.parse.
 */

/** Minimum safe long value: -(2^53 - 1) */
export const SAFE_LONG_MIN = -(2 ** 53 - 1); // -9007199254740991

/** Maximum safe long value: 2^53 - 1 */
export const SAFE_LONG_MAX = 2 ** 53 - 1; // 9007199254740991

/** Branded type representing a validated safe long integer. */
export type SafeLong = number & { readonly __brand: "SafeLong" };

/**
 * Returns true if the given number is an integer within the safe long range.
 */
export function isSafeLong(n: number): n is SafeLong {
  return Number.isInteger(n) && n >= SAFE_LONG_MIN && n <= SAFE_LONG_MAX;
}

/**
 * Asserts that the given number is a safe long. Throws a RangeError otherwise.
 */
export function assertSafeLong(n: number): asserts n is SafeLong {
  if (!Number.isInteger(n)) {
    throw new RangeError(`Value ${n} is not an integer`);
  }
  if (n < SAFE_LONG_MIN || n > SAFE_LONG_MAX) {
    throw new RangeError(
      `Value ${n} is outside the safe long range [${SAFE_LONG_MIN}, ${SAFE_LONG_MAX}]`,
    );
  }
}
