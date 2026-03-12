/**
 * Child logger functionality.
 *
 * The child logger capability is implemented directly on the Logger class
 * via the `Logger.child()` method. This module re-exports the Logger
 * for convenience and documents the child logger pattern.
 *
 * @example
 * ```ts
 * const parent = new Logger({ service: "api" });
 * const child = parent.child({
 *   requestId: safeArg("requestId", "abc-123"),
 * });
 * child.info("handling request"); // includes requestId in every line
 * ```
 */

export { Logger } from "./logger.js";
