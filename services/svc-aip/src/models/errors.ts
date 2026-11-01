import { ErrorCode, OpenFoundryApiError } from "@openfoundry/errors";

/**
 * The Foundry errors the served `models` operations declare, with the names
 * and parameters `foundry_sdk/v2/models/errors.py` (and, for the display-name
 * and folder errors, `foundry_sdk/v2/filesystem/errors.py`) give them, so a
 * generated client raises the typed exception rather than a generic one.
 */

function foundryError(
  errorCode: ErrorCode,
  errorName: string,
  message: string,
  parameters: Record<string, unknown>,
): OpenFoundryApiError {
  return new OpenFoundryApiError({ errorCode, errorName, message, parameters });
}

export function apiFeaturePreviewUsageOnly(): OpenFoundryApiError {
  return foundryError(
    ErrorCode.INVALID_ARGUMENT,
    "ApiFeaturePreviewUsageOnly",
    "This feature is only supported in preview mode. Please use `preview=true` in the query parameters to call this endpoint.",
    {},
  );
}

export function modelNotFound(modelRid: string): OpenFoundryApiError {
  return foundryError(ErrorCode.NOT_FOUND, "ModelNotFound", `Model not found: ${modelRid}`, {
    modelRid,
  });
}

export function modelVersionNotFound(
  modelRid: string,
  modelVersionRid: string,
): OpenFoundryApiError {
  return foundryError(
    ErrorCode.NOT_FOUND,
    "ModelVersionNotFound",
    `Model version ${modelVersionRid} not found on model ${modelRid}`,
    { modelRid, modelVersionRid },
  );
}

export function modelStudioNotFound(studioRid: string): OpenFoundryApiError {
  return foundryError(
    ErrorCode.NOT_FOUND,
    "ModelStudioNotFound",
    `Model Studio not found: ${studioRid}`,
    { studioRid },
  );
}

/** `InvalidModelApi` carries a category and a description, both free strings. */
export function invalidModelApi(errorType: string, message: string): OpenFoundryApiError {
  return foundryError(ErrorCode.INVALID_ARGUMENT, "InvalidModelApi", message, {
    errorType,
    message,
  });
}

export function invalidModelStudioCreateRequest(message: string): OpenFoundryApiError {
  return foundryError(
    ErrorCode.INVALID_ARGUMENT,
    "InvalidModelStudioCreateRequest",
    message,
    {},
  );
}

export function invalidDisplayName(displayName: string): OpenFoundryApiError {
  return foundryError(
    ErrorCode.INVALID_ARGUMENT,
    "InvalidDisplayName",
    "The display name of a resource should not be exactly `.` or `..`, contain a forward slash `/` and must be less than or equal to 700 characters.",
    { displayName },
  );
}

export function resourceNameAlreadyExists(
  parentFolderRid: string,
  displayName: string,
): OpenFoundryApiError {
  return foundryError(
    ErrorCode.CONFLICT,
    "ResourceNameAlreadyExists",
    `The name "${displayName}" is already in use by another resource in folder ${parentFolderRid}.`,
    { parentFolderRid, displayName },
  );
}
