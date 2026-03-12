/**
 * Standard error codes mapping to HTTP status codes.
 *
 * Mirrors the Palantir error code taxonomy, covering the standard set of
 * API error conditions. Each code has a canonical HTTP status code used
 * when serializing errors into HTTP responses.
 */
export enum ErrorCode {
  PERMISSION_DENIED = "PERMISSION_DENIED",
  NOT_FOUND = "NOT_FOUND",
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  CONFLICT = "CONFLICT",
  INTERNAL = "INTERNAL",
  TIMEOUT = "TIMEOUT",
  CUSTOM_CLIENT = "CUSTOM_CLIENT",
  CUSTOM_SERVER = "CUSTOM_SERVER",
}

const ERROR_CODE_TO_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.PERMISSION_DENIED]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.INVALID_ARGUMENT]: 400,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.CUSTOM_CLIENT]: 400,
  [ErrorCode.CUSTOM_SERVER]: 500,
};

/**
 * Returns the canonical HTTP status code for the given error code.
 */
export function statusCodeForError(code: ErrorCode): number {
  return ERROR_CODE_TO_STATUS[code];
}

/**
 * Attempts to derive an ErrorCode from an HTTP status code.
 * Falls back to CUSTOM_CLIENT for 4xx and CUSTOM_SERVER for 5xx.
 * Returns INTERNAL for unrecognized status codes.
 */
export function errorCodeFromStatus(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return ErrorCode.INVALID_ARGUMENT;
    case 403:
      return ErrorCode.PERMISSION_DENIED;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 500:
      return ErrorCode.INTERNAL;
    case 504:
      return ErrorCode.TIMEOUT;
    default:
      if (statusCode >= 400 && statusCode < 500) {
        return ErrorCode.CUSTOM_CLIENT;
      }
      if (statusCode >= 500 && statusCode < 600) {
        return ErrorCode.CUSTOM_SERVER;
      }
      return ErrorCode.INTERNAL;
  }
}
