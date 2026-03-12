import { timingSafeEqual } from "node:crypto";

/**
 * A bearer token wrapper that provides:
 *
 * - Constant-time equality comparison to prevent timing attacks.
 * - toString() / toJSON() / inspect() redaction to prevent accidental logging
 *   (equivalent to Palantir's @DoNotLog annotation).
 * - Immutability via Object.freeze.
 */
export class BearerToken {
  /** The raw token value. Access this only when you need to transmit the token. */
  readonly #value: string;

  constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error("BearerToken value must be a non-empty string");
    }
    this.#value = value;
    Object.freeze(this);
  }

  /**
   * Retrieve the raw token string.
   *
   * Intentionally named `dangerouslyGetValue` to signal that callers should
   * handle the result with care and never log it.
   */
  dangerouslyGetValue(): string {
    return this.#value;
  }

  /**
   * Constant-time equality check against another BearerToken or raw string.
   *
   * Returns `false` for values of different lengths without leaking which
   * bytes differ.
   */
  equals(other: BearerToken | string): boolean {
    const otherValue =
      other instanceof BearerToken ? other.dangerouslyGetValue() : other;

    const a = Buffer.from(this.#value, "utf-8");
    const b = Buffer.from(otherValue, "utf-8");

    if (a.length !== b.length) {
      // Compare against self to keep timing constant, then return false.
      timingSafeEqual(a, a);
      return false;
    }

    return timingSafeEqual(a, b);
  }

  /**
   * Returns the `Authorization` header value for HTTP requests.
   */
  toAuthorizationHeader(): string {
    return `Bearer ${this.#value}`;
  }

  // -------------------------------------------------------------------------
  // Redaction — prevents accidental exposure in logs
  // -------------------------------------------------------------------------

  /** @DoNotLog equivalent: redacted representation. */
  toString(): string {
    return "[REDACTED BearerToken]";
  }

  /** Prevents JSON.stringify from leaking the token. */
  toJSON(): string {
    return "[REDACTED BearerToken]";
  }

  /** Node.js custom inspect for console.log / util.inspect. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "[REDACTED BearerToken]";
  }
}
