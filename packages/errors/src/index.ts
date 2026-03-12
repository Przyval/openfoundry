export { ErrorCode, statusCodeForError, errorCodeFromStatus } from "./error-codes.js";

export {
  OpenFoundryApiError,
  type SerializedApiError,
  type ErrorResponse,
  type ErrorResponseBody,
} from "./api-error.js";

export {
  type SafeArg,
  type UnsafeArg,
  type Arg,
  safeArg,
  unsafeArg,
  isSafeArg,
  isUnsafeArg,
  filterSafeArgs,
  toSafeRecord,
  toFullRecord,
} from "./safe-arg.js";

export {
  notFound,
  permissionDenied,
  invalidArgument,
  conflict,
  internal,
  timeout,
  customClient,
  customServer,
} from "./error-factories.js";
