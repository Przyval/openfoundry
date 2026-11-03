import { ErrorCode, OpenFoundryApiError } from "@openfoundry/errors";

/**
 * The Foundry errors the served `connectivity` operations declare, with the
 * names and parameters `foundry_sdk/v2/connectivity/errors.py` gives them, so a
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

const bad = (name: string, message: string, parameters: Record<string, unknown> = {}) =>
  foundryError(ErrorCode.INVALID_ARGUMENT, name, message, parameters);

export function apiFeaturePreviewUsageOnly(): OpenFoundryApiError {
  return bad(
    "ApiFeaturePreviewUsageOnly",
    "This feature is only supported in preview mode. Please use `preview=true` in the query parameters to call this endpoint.",
  );
}

export function connectionNotFound(connectionRid: string): OpenFoundryApiError {
  return foundryError(
    ErrorCode.NOT_FOUND,
    "ConnectionNotFound",
    `Connection not found: ${connectionRid}`,
    { connectionRid },
  );
}

export function fileImportNotFound(
  connectionRid: string,
  fileImportRid: string,
): OpenFoundryApiError {
  return foundryError(
    ErrorCode.NOT_FOUND,
    "FileImportNotFound",
    `File import ${fileImportRid} not found on connection ${connectionRid}`,
    { connectionRid, fileImportRid },
  );
}

export function tableImportNotFound(
  connectionRid: string,
  tableImportRid: string,
): OpenFoundryApiError {
  return foundryError(
    ErrorCode.NOT_FOUND,
    "TableImportNotFound",
    `Table import ${tableImportRid} not found on connection ${connectionRid}`,
    { connectionRid, tableImportRid },
  );
}

export function propertyCannotBeBlank(propertyName: string): OpenFoundryApiError {
  return bad("PropertyCannotBeBlank", `Property ${propertyName} cannot be blank.`, {
    propertyName,
  });
}

export function propertyCannotBeEmpty(propertyName: string): OpenFoundryApiError {
  return bad("PropertyCannotBeEmpty", `Property ${propertyName} cannot be empty.`, {
    propertyName,
  });
}

export function portNotInRange(port: number): OpenFoundryApiError {
  return bad("PortNotInRange", `Port ${port} is not in the range 1-65535.`, { port });
}

export function hostNameCannotHaveProtocolOrPort(hostName: string): OpenFoundryApiError {
  return bad(
    "HostNameCannotHaveProtocolOrPort",
    "A host name must not include a protocol or a port.",
    { hostName },
  );
}

export function invalidShareName(shareName: string): OpenFoundryApiError {
  return bad(
    "InvalidShareName",
    'The share name is invalid. Share names cannot contain the following characters: \\ / : * ? " < > |',
    { shareName },
  );
}

export function domainMustUseHttpsWithAuthentication(): OpenFoundryApiError {
  return bad(
    "DomainMustUseHttpsWithAuthentication",
    "A domain that carries authentication must use HTTPS.",
  );
}

export function encryptedPropertyMustBeSpecifiedAsPlaintextValue(
  propertyName: string,
): OpenFoundryApiError {
  return bad(
    "EncryptedPropertyMustBeSpecifiedAsPlaintextValue",
    `Property ${propertyName} has no stored secret yet, so it must be specified as a plaintext value.`,
    { propertyName },
  );
}

export function additionalSecretsMustBeSpecifiedAsPlaintextValueMap(): OpenFoundryApiError {
  return bad(
    "AdditionalSecretsMustBeSpecifiedAsPlaintextValueMap",
    "Additional secrets of a new connection must be specified as a map of plaintext values.",
  );
}

export function unknownWorkerCannotBeUsedForCreatingOrUpdatingConnections(): OpenFoundryApiError {
  return bad(
    "UnknownWorkerCannotBeUsedForCreatingOrUpdatingConnections",
    "The unknownWorker cannot be used to create or update a connection.",
  );
}

export function secretNamesDoNotExist(
  connectionRid: string,
  secretNames: string[],
): OpenFoundryApiError {
  return bad(
    "SecretNamesDoNotExist",
    `Connection ${connectionRid} has no secrets named: ${secretNames.join(", ")}`,
    { connectionRid, secretNames },
  );
}

export function fileImportNotSupportedForConnection(connectionRid: string): OpenFoundryApiError {
  return bad(
    "FileImportNotSupportedForConnection",
    `Connection ${connectionRid} does not support file imports.`,
    { connectionRid },
  );
}

export function tableImportNotSupportedForConnection(
  connectionRid: string,
  tableImportType: string,
): OpenFoundryApiError {
  return bad(
    "TableImportNotSupportedForConnection",
    `Connection ${connectionRid} does not support table imports of type ${tableImportType}.`,
    { connectionRid, tableImportType },
  );
}

export function fileImportCustomFilterCannotBeUsedToCreateOrUpdateFileImports(): OpenFoundryApiError {
  return bad(
    "FileImportCustomFilterCannotBeUsedToCreateOrUpdateFileImports",
    "A customFilter cannot be used to create or update a file import.",
  );
}

export function filesCountLimitFilterInvalidLimit(filesCount: number): OpenFoundryApiError {
  return bad(
    "FilesCountLimitFilterInvalidLimit",
    "filesCount of a filesCountLimitFilter must be greater than zero.",
    { filesCount },
  );
}

export function fileAtLeastCountFilterInvalidMinCount(minFilesCount: number): OpenFoundryApiError {
  return bad(
    "FileAtLeastCountFilterInvalidMinCount",
    "minFilesCount of an atLeastCountFilter must be greater than zero.",
    { minFilesCount },
  );
}

export function fileSizeFilterMissingGreaterThanAndLessThan(): OpenFoundryApiError {
  return bad(
    "FileSizeFilterMissingGreaterThanAndLessThan",
    "A fileSizeFilter needs at least one of gt and lt.",
  );
}

export function fileSizeFilterGreaterThanCannotBeNegative(gt: number): OpenFoundryApiError {
  return bad("FileSizeFilterGreaterThanCannotBeNegative", "gt cannot be negative.", { gt });
}

export function fileSizeFilterLessThanMustBeOneByteOrLarger(lt: number): OpenFoundryApiError {
  return bad("FileSizeFilterLessThanMustBeOneByteOrLarger", "lt must be one byte or larger.", {
    lt,
  });
}

export function fileSizeFilterInvalidGreaterThanAndLessThanRange(
  gt: number,
  lt: number,
): OpenFoundryApiError {
  return bad(
    "FileSizeFilterInvalidGreaterThanAndLessThanRange",
    "gt must be smaller than lt, or no size can match.",
    { gt, lt },
  );
}

export function invalidVirtualTableConnection(
  connection: string,
  reason: string,
): OpenFoundryApiError {
  return bad(
    "InvalidVirtualTableConnection",
    `Connection ${connection} cannot back this virtual table: ${reason}`,
    { connection, reason },
  );
}

export function virtualTableAlreadyExists(parentRid: string, name: string): OpenFoundryApiError {
  return foundryError(
    ErrorCode.CONFLICT,
    "VirtualTableAlreadyExists",
    `A virtual table named "${name}" already exists in ${parentRid}.`,
    { parentRid, name },
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

export function secretsKeyNotConfigured(): OpenFoundryApiError {
  return foundryError(
    ErrorCode.INTERNAL,
    "SecretsKeyNotConfigured",
    "CONNECTIVITY_SECRETS_KEY is not set, so this service has no key to encrypt connection secrets with.",
    {},
  );
}
