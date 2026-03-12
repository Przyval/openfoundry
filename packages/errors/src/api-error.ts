import { ErrorCode, errorCodeFromStatus, statusCodeForError } from "./error-codes.js";
import { type Arg, toSafeRecord, toFullRecord } from "./safe-arg.js";

/**
 * Serialized form of an OpenFoundry API error, matching the wire format.
 */
export interface SerializedApiError {
  errorCode: ErrorCode;
  errorName: string;
  errorInstanceId: string;
  parameters: Record<string, unknown>;
  statusCode: number;
}

/**
 * Minimal response shape used by the `fromResponse` factory.
 */
export interface ErrorResponseBody {
  errorCode?: string;
  errorName?: string;
  errorInstanceId?: string;
  parameters?: Record<string, unknown>;
}

export interface ErrorResponse {
  status: number;
  body?: ErrorResponseBody;
}

/**
 * Structured API error for the OpenFoundry platform.
 *
 * Every error carries:
 * - `errorCode`        — canonical error category (e.g. NOT_FOUND, CONFLICT)
 * - `errorName`        — specific error name (e.g. "ObjectNotFound")
 * - `errorInstanceId`  — unique UUID for tracing a single occurrence
 * - `statusCode`       — HTTP status code
 * - `parameters`       — structured context about the error
 * - `args`             — typed safe/unsafe arguments for logging
 */
export class OpenFoundryApiError extends Error {
  readonly errorCode: ErrorCode;
  readonly errorName: string;
  readonly errorInstanceId: string;
  readonly statusCode: number;
  readonly parameters: Record<string, unknown>;
  readonly args: readonly Arg[];

  constructor(options: {
    errorCode: ErrorCode;
    errorName: string;
    message: string;
    errorInstanceId?: string;
    statusCode?: number;
    parameters?: Record<string, unknown>;
    args?: Arg[];
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "OpenFoundryApiError";
    this.errorCode = options.errorCode;
    this.errorName = options.errorName;
    this.errorInstanceId = options.errorInstanceId ?? generateId();
    this.statusCode = options.statusCode ?? statusCodeForError(options.errorCode);
    this.parameters = options.parameters ?? {};
    this.args = options.args ?? [];
  }

  /**
   * Serializes the error for an API response body.
   * Unsafe arguments are redacted from the parameters.
   */
  toJSON(): SerializedApiError {
    return {
      errorCode: this.errorCode,
      errorName: this.errorName,
      errorInstanceId: this.errorInstanceId,
      parameters: {
        ...this.parameters,
        ...toSafeRecord(this.args),
      },
      statusCode: this.statusCode,
    };
  }

  /**
   * Returns all parameters including unsafe arg values.
   * Only use in secure/internal logging contexts.
   */
  toInternalJSON(): SerializedApiError {
    return {
      errorCode: this.errorCode,
      errorName: this.errorName,
      errorInstanceId: this.errorInstanceId,
      parameters: {
        ...this.parameters,
        ...toFullRecord(this.args),
      },
      statusCode: this.statusCode,
    };
  }

  /**
   * Creates an OpenFoundryApiError from an HTTP error response.
   *
   * Parses the response body if available, falling back to deriving
   * the error code from the HTTP status code.
   */
  static fromResponse(response: ErrorResponse): OpenFoundryApiError {
    const body = response.body;

    const errorCode = (body?.errorCode && isErrorCode(body.errorCode))
      ? body.errorCode
      : errorCodeFromStatus(response.status);

    return new OpenFoundryApiError({
      errorCode,
      errorName: body?.errorName ?? "UnknownError",
      message: `API error ${response.status}: ${body?.errorName ?? "UnknownError"}`,
      errorInstanceId: body?.errorInstanceId ?? generateId(),
      statusCode: response.status,
      parameters: body?.parameters ?? {},
    });
  }
}

function isErrorCode(value: string): value is ErrorCode {
  return Object.values(ErrorCode).includes(value as ErrorCode);
}

/**
 * Generates a v4-style UUID for error instance tracking.
 * Uses crypto.randomUUID when available, otherwise falls back to a simple implementation.
 */
function generateId(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
