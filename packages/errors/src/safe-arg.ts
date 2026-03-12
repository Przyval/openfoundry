/**
 * Structured argument types for safe logging and error reporting.
 *
 * SafeArg values are safe to log, expose in diagnostics, and include in
 * error responses. UnsafeArg values contain PII or sensitive data and
 * must be redacted in logs and external-facing outputs.
 */

/** Marker brand for compile-time safety classification. */
const SAFE_BRAND = Symbol("SafeArg");
const UNSAFE_BRAND = Symbol("UnsafeArg");

/**
 * An argument that is safe to log and expose externally.
 * Contains no PII or sensitive information.
 */
export interface SafeArg<T = unknown> {
  readonly [SAFE_BRAND]: true;
  readonly key: string;
  readonly value: T;
  readonly safe: true;
}

/**
 * An argument that contains PII or sensitive data.
 * Must be redacted in logs and never exposed in external error responses.
 */
export interface UnsafeArg<T = unknown> {
  readonly [UNSAFE_BRAND]: true;
  readonly key: string;
  readonly value: T;
  readonly safe: false;
}

export type Arg<T = unknown> = SafeArg<T> | UnsafeArg<T>;

/**
 * Creates a safe argument that can be freely logged and included in error responses.
 *
 * @example
 * ```ts
 * safeArg("objectType", "Employee")
 * safeArg("statusCode", 404)
 * ```
 */
export function safeArg<T>(key: string, value: T): SafeArg<T> {
  return {
    [SAFE_BRAND]: true,
    key,
    value,
    safe: true,
  };
}

/**
 * Creates an unsafe argument containing PII or sensitive data.
 * The value will be redacted when serialized into logs or external responses.
 *
 * @example
 * ```ts
 * unsafeArg("userId", "user-12345")
 * unsafeArg("email", "alice@example.com")
 * ```
 */
export function unsafeArg<T>(key: string, value: T): UnsafeArg<T> {
  return {
    [UNSAFE_BRAND]: true,
    key,
    value,
    safe: false,
  };
}

/**
 * Returns true if the argument is safe to log.
 */
export function isSafeArg(arg: Arg): arg is SafeArg {
  return arg.safe === true;
}

/**
 * Returns true if the argument is unsafe (contains PII/sensitive data).
 */
export function isUnsafeArg(arg: Arg): arg is UnsafeArg {
  return arg.safe === false;
}

/**
 * Extracts only the safe arguments from a list, suitable for logging.
 */
export function filterSafeArgs(args: readonly Arg[]): SafeArg[] {
  return args.filter(isSafeArg);
}

/**
 * Converts a list of Args into a record, redacting unsafe values.
 * Safe values are included as-is; unsafe values are replaced with "[REDACTED]".
 */
export function toSafeRecord(args: readonly Arg[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const arg of args) {
    record[arg.key] = arg.safe ? arg.value : "[REDACTED]";
  }
  return record;
}

/**
 * Converts a list of Args into a record with all values, including unsafe ones.
 * Only use in secure/internal contexts where PII exposure is acceptable.
 */
export function toFullRecord(args: readonly Arg[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const arg of args) {
    record[arg.key] = arg.value;
  }
  return record;
}
