import { ErrorCode } from "./error-codes.js";
import { OpenFoundryApiError } from "./api-error.js";
import { type Arg, safeArg } from "./safe-arg.js";

/**
 * Creates a NOT_FOUND error for a missing entity.
 *
 * @param entityType - The type of entity (e.g. "Object", "Ontology")
 * @param entityId   - The identifier that was not found
 *
 * @example
 * ```ts
 * throw notFound("Object", "ri.ontology.main.object.abc123");
 * ```
 */
export function notFound(entityType: string, entityId: string): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.NOT_FOUND,
    errorName: `${entityType}NotFound`,
    message: `${entityType} not found: ${entityId}`,
    args: [
      safeArg("entityType", entityType),
      safeArg("entityId", entityId),
    ],
  });
}

/**
 * Creates a PERMISSION_DENIED error.
 *
 * @param resource - The resource the caller tried to access
 * @param action   - The action that was denied (e.g. "read", "write", "delete")
 *
 * @example
 * ```ts
 * throw permissionDenied("Ontology:employees", "write");
 * ```
 */
export function permissionDenied(resource: string, action: string): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.PERMISSION_DENIED,
    errorName: "PermissionDenied",
    message: `Permission denied: cannot ${action} on ${resource}`,
    args: [
      safeArg("resource", resource),
      safeArg("action", action),
    ],
  });
}

/**
 * Creates an INVALID_ARGUMENT error.
 *
 * @param param  - The parameter name that was invalid
 * @param reason - A human-readable explanation of why the argument is invalid
 *
 * @example
 * ```ts
 * throw invalidArgument("pageSize", "must be between 1 and 1000");
 * ```
 */
export function invalidArgument(param: string, reason: string): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.INVALID_ARGUMENT,
    errorName: "InvalidArgument",
    message: `Invalid argument '${param}': ${reason}`,
    args: [
      safeArg("param", param),
      safeArg("reason", reason),
    ],
  });
}

/**
 * Creates a CONFLICT error.
 *
 * @param resource - The resource that caused the conflict
 * @param reason   - A human-readable explanation of the conflict
 *
 * @example
 * ```ts
 * throw conflict("ObjectType:Employee", "already exists");
 * ```
 */
export function conflict(resource: string, reason: string): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.CONFLICT,
    errorName: "Conflict",
    message: `Conflict on ${resource}: ${reason}`,
    args: [
      safeArg("resource", resource),
      safeArg("reason", reason),
    ],
  });
}

/**
 * Creates an INTERNAL server error.
 *
 * @param message - Internal error description (will be logged but not necessarily exposed)
 * @param cause   - Optional underlying error
 *
 * @example
 * ```ts
 * throw internal("Unexpected null in ontology resolution");
 * ```
 */
export function internal(message: string, cause?: unknown): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.INTERNAL,
    errorName: "InternalError",
    message,
    cause,
  });
}

/**
 * Creates a TIMEOUT error.
 *
 * @param operation  - The operation that timed out
 * @param durationMs - The timeout duration in milliseconds
 */
export function timeout(operation: string, durationMs: number): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.TIMEOUT,
    errorName: "Timeout",
    message: `Operation '${operation}' timed out after ${durationMs}ms`,
    args: [
      safeArg("operation", operation),
      safeArg("durationMs", durationMs),
    ],
  });
}

/**
 * Creates a custom client error (4xx) with an explicit status code.
 *
 * @param statusCode - HTTP status code (must be 4xx)
 * @param errorName  - The specific error name
 * @param message    - Error description
 * @param args       - Optional structured arguments
 */
export function customClient(
  statusCode: number,
  errorName: string,
  message: string,
  args?: Arg[],
): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.CUSTOM_CLIENT,
    errorName,
    message,
    statusCode,
    args,
  });
}

/**
 * Creates a custom server error (5xx) with an explicit status code.
 *
 * @param statusCode - HTTP status code (must be 5xx)
 * @param errorName  - The specific error name
 * @param message    - Error description
 * @param args       - Optional structured arguments
 */
export function customServer(
  statusCode: number,
  errorName: string,
  message: string,
  args?: Arg[],
): OpenFoundryApiError {
  return new OpenFoundryApiError({
    errorCode: ErrorCode.CUSTOM_SERVER,
    errorName,
    message,
    statusCode,
    args,
  });
}
