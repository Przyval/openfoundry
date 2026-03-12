/**
 * Request-scoped logging utilities.
 */

import { safeArg } from "@openfoundry/errors";
import { Logger } from "./logger.js";

/**
 * Creates a child logger with a requestId binding, suitable for
 * tracing a single request through the system.
 */
export function createRequestLogger(logger: Logger, requestId: string): Logger {
  return logger.child({
    requestId: safeArg("requestId", requestId),
  });
}

/**
 * Logs an HTTP request with standard fields: method, url, statusCode, durationMs.
 * All request fields are classified as safe args since they contain no PII.
 */
export function logRequest(
  logger: Logger,
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
): void {
  logger.info(
    "HTTP request completed",
    safeArg("method", method),
    safeArg("url", url),
    safeArg("statusCode", statusCode),
    safeArg("durationMs", durationMs),
  );
}
