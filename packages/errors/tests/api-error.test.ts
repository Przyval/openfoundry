import { describe, expect, it } from "vitest";
import {
  OpenFoundryApiError,
  ErrorCode,
  statusCodeForError,
  errorCodeFromStatus,
  safeArg,
  unsafeArg,
  isSafeArg,
  isUnsafeArg,
  filterSafeArgs,
  toSafeRecord,
  toFullRecord,
  notFound,
  permissionDenied,
  invalidArgument,
  conflict,
  internal,
  timeout,
  customClient,
  customServer,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// ErrorCode mapping
// ---------------------------------------------------------------------------

describe("ErrorCode", () => {
  it("maps error codes to correct HTTP status codes", () => {
    expect(statusCodeForError(ErrorCode.PERMISSION_DENIED)).toBe(403);
    expect(statusCodeForError(ErrorCode.NOT_FOUND)).toBe(404);
    expect(statusCodeForError(ErrorCode.INVALID_ARGUMENT)).toBe(400);
    expect(statusCodeForError(ErrorCode.CONFLICT)).toBe(409);
    expect(statusCodeForError(ErrorCode.INTERNAL)).toBe(500);
    expect(statusCodeForError(ErrorCode.TIMEOUT)).toBe(504);
    expect(statusCodeForError(ErrorCode.CUSTOM_CLIENT)).toBe(400);
    expect(statusCodeForError(ErrorCode.CUSTOM_SERVER)).toBe(500);
  });

  it("derives error code from HTTP status", () => {
    expect(errorCodeFromStatus(400)).toBe(ErrorCode.INVALID_ARGUMENT);
    expect(errorCodeFromStatus(403)).toBe(ErrorCode.PERMISSION_DENIED);
    expect(errorCodeFromStatus(404)).toBe(ErrorCode.NOT_FOUND);
    expect(errorCodeFromStatus(409)).toBe(ErrorCode.CONFLICT);
    expect(errorCodeFromStatus(500)).toBe(ErrorCode.INTERNAL);
    expect(errorCodeFromStatus(504)).toBe(ErrorCode.TIMEOUT);
  });

  it("falls back to CUSTOM_CLIENT for unknown 4xx", () => {
    expect(errorCodeFromStatus(418)).toBe(ErrorCode.CUSTOM_CLIENT);
    expect(errorCodeFromStatus(429)).toBe(ErrorCode.CUSTOM_CLIENT);
  });

  it("falls back to CUSTOM_SERVER for unknown 5xx", () => {
    expect(errorCodeFromStatus(502)).toBe(ErrorCode.CUSTOM_SERVER);
    expect(errorCodeFromStatus(503)).toBe(ErrorCode.CUSTOM_SERVER);
  });

  it("falls back to INTERNAL for non-error status codes", () => {
    expect(errorCodeFromStatus(200)).toBe(ErrorCode.INTERNAL);
    expect(errorCodeFromStatus(301)).toBe(ErrorCode.INTERNAL);
  });
});

// ---------------------------------------------------------------------------
// OpenFoundryApiError
// ---------------------------------------------------------------------------

describe("OpenFoundryApiError", () => {
  it("constructs with all required fields", () => {
    const err = new OpenFoundryApiError({
      errorCode: ErrorCode.NOT_FOUND,
      errorName: "ObjectNotFound",
      message: "Object not found: abc",
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OpenFoundryApiError);
    expect(err.name).toBe("OpenFoundryApiError");
    expect(err.errorCode).toBe(ErrorCode.NOT_FOUND);
    expect(err.errorName).toBe("ObjectNotFound");
    expect(err.message).toBe("Object not found: abc");
    expect(err.statusCode).toBe(404);
    expect(err.errorInstanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(err.parameters).toEqual({});
    expect(err.args).toEqual([]);
  });

  it("accepts explicit statusCode and errorInstanceId", () => {
    const err = new OpenFoundryApiError({
      errorCode: ErrorCode.CUSTOM_CLIENT,
      errorName: "RateLimited",
      message: "Too many requests",
      statusCode: 429,
      errorInstanceId: "test-id-123",
    });

    expect(err.statusCode).toBe(429);
    expect(err.errorInstanceId).toBe("test-id-123");
  });

  it("preserves the cause", () => {
    const cause = new Error("underlying");
    const err = new OpenFoundryApiError({
      errorCode: ErrorCode.INTERNAL,
      errorName: "InternalError",
      message: "wrapped",
      cause,
    });

    expect(err.cause).toBe(cause);
  });

  it("serializes to JSON with safe args only", () => {
    const err = new OpenFoundryApiError({
      errorCode: ErrorCode.NOT_FOUND,
      errorName: "UserNotFound",
      message: "User not found",
      errorInstanceId: "inst-001",
      parameters: { extra: "context" },
      args: [
        safeArg("entityType", "User"),
        unsafeArg("email", "alice@example.com"),
      ],
    });

    const json = err.toJSON();
    expect(json).toEqual({
      errorCode: "NOT_FOUND",
      errorName: "UserNotFound",
      errorInstanceId: "inst-001",
      parameters: {
        extra: "context",
        entityType: "User",
        email: "[REDACTED]",
      },
      statusCode: 404,
    });
  });

  it("serializes to internal JSON with all args", () => {
    const err = new OpenFoundryApiError({
      errorCode: ErrorCode.NOT_FOUND,
      errorName: "UserNotFound",
      message: "User not found",
      errorInstanceId: "inst-002",
      args: [
        safeArg("entityType", "User"),
        unsafeArg("email", "alice@example.com"),
      ],
    });

    const json = err.toInternalJSON();
    expect(json.parameters).toEqual({
      entityType: "User",
      email: "alice@example.com",
    });
  });

  it("creates from a response with a body", () => {
    const err = OpenFoundryApiError.fromResponse({
      status: 404,
      body: {
        errorCode: "NOT_FOUND",
        errorName: "ObjectNotFound",
        errorInstanceId: "resp-001",
        parameters: { objectRid: "ri.obj.1" },
      },
    });

    expect(err.errorCode).toBe(ErrorCode.NOT_FOUND);
    expect(err.errorName).toBe("ObjectNotFound");
    expect(err.errorInstanceId).toBe("resp-001");
    expect(err.statusCode).toBe(404);
    expect(err.parameters).toEqual({ objectRid: "ri.obj.1" });
  });

  it("creates from a response without a body", () => {
    const err = OpenFoundryApiError.fromResponse({ status: 503 });

    expect(err.errorCode).toBe(ErrorCode.CUSTOM_SERVER);
    expect(err.errorName).toBe("UnknownError");
    expect(err.statusCode).toBe(503);
  });

  it("creates from a response with an unrecognized error code", () => {
    const err = OpenFoundryApiError.fromResponse({
      status: 422,
      body: {
        errorCode: "MADE_UP_CODE",
        errorName: "SomethingWeird",
      },
    });

    expect(err.errorCode).toBe(ErrorCode.CUSTOM_CLIENT);
    expect(err.errorName).toBe("SomethingWeird");
    expect(err.statusCode).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// SafeArg / UnsafeArg
// ---------------------------------------------------------------------------

describe("SafeArg / UnsafeArg", () => {
  it("creates safe args", () => {
    const arg = safeArg("key", "value");
    expect(arg.key).toBe("key");
    expect(arg.value).toBe("value");
    expect(arg.safe).toBe(true);
    expect(isSafeArg(arg)).toBe(true);
    expect(isUnsafeArg(arg)).toBe(false);
  });

  it("creates unsafe args", () => {
    const arg = unsafeArg("email", "alice@test.com");
    expect(arg.key).toBe("email");
    expect(arg.value).toBe("alice@test.com");
    expect(arg.safe).toBe(false);
    expect(isSafeArg(arg)).toBe(false);
    expect(isUnsafeArg(arg)).toBe(true);
  });

  it("filters safe args from a mixed list", () => {
    const args = [
      safeArg("type", "User"),
      unsafeArg("ssn", "123-45-6789"),
      safeArg("action", "read"),
    ];

    const safe = filterSafeArgs(args);
    expect(safe).toHaveLength(2);
    expect(safe.map((a) => a.key)).toEqual(["type", "action"]);
  });

  it("converts to safe record with redaction", () => {
    const args = [
      safeArg("type", "User"),
      unsafeArg("email", "alice@test.com"),
    ];

    expect(toSafeRecord(args)).toEqual({
      type: "User",
      email: "[REDACTED]",
    });
  });

  it("converts to full record without redaction", () => {
    const args = [
      safeArg("type", "User"),
      unsafeArg("email", "alice@test.com"),
    ];

    expect(toFullRecord(args)).toEqual({
      type: "User",
      email: "alice@test.com",
    });
  });
});

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

describe("Error factories", () => {
  it("notFound", () => {
    const err = notFound("Object", "ri.obj.abc");
    expect(err.errorCode).toBe(ErrorCode.NOT_FOUND);
    expect(err.errorName).toBe("ObjectNotFound");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Object not found: ri.obj.abc");
    expect(err.args).toHaveLength(2);
  });

  it("permissionDenied", () => {
    const err = permissionDenied("Ontology:employees", "write");
    expect(err.errorCode).toBe(ErrorCode.PERMISSION_DENIED);
    expect(err.errorName).toBe("PermissionDenied");
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain("write");
    expect(err.message).toContain("Ontology:employees");
  });

  it("invalidArgument", () => {
    const err = invalidArgument("pageSize", "must be between 1 and 1000");
    expect(err.errorCode).toBe(ErrorCode.INVALID_ARGUMENT);
    expect(err.errorName).toBe("InvalidArgument");
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain("pageSize");
  });

  it("conflict", () => {
    const err = conflict("ObjectType:Employee", "already exists");
    expect(err.errorCode).toBe(ErrorCode.CONFLICT);
    expect(err.errorName).toBe("Conflict");
    expect(err.statusCode).toBe(409);
  });

  it("internal", () => {
    const cause = new Error("db failed");
    const err = internal("Unexpected error during resolution", cause);
    expect(err.errorCode).toBe(ErrorCode.INTERNAL);
    expect(err.errorName).toBe("InternalError");
    expect(err.statusCode).toBe(500);
    expect(err.cause).toBe(cause);
  });

  it("timeout", () => {
    const err = timeout("fetchOntology", 30000);
    expect(err.errorCode).toBe(ErrorCode.TIMEOUT);
    expect(err.errorName).toBe("Timeout");
    expect(err.statusCode).toBe(504);
    expect(err.message).toContain("30000ms");
  });

  it("customClient", () => {
    const err = customClient(429, "RateLimited", "Too many requests", [
      safeArg("retryAfter", 60),
    ]);
    expect(err.errorCode).toBe(ErrorCode.CUSTOM_CLIENT);
    expect(err.statusCode).toBe(429);
    expect(err.args).toHaveLength(1);
  });

  it("customServer", () => {
    const err = customServer(503, "ServiceUnavailable", "Try again later");
    expect(err.errorCode).toBe(ErrorCode.CUSTOM_SERVER);
    expect(err.statusCode).toBe(503);
  });
});
