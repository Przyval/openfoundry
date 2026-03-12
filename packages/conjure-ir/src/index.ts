export type {
  AliasDefinition,
  ArgumentDefinition,
  AuthType,
  ConjureDefinition,
  DeprecatedInfo,
  EndpointDefinition,
  EnumDefinition,
  EnumValueDefinition,
  ErrorCode,
  ErrorDefinition,
  FieldDefinition,
  HttpMethod,
  LogSafety,
  ObjectDefinition,
  ParamType,
  PrimitiveType,
  ServiceDefinition,
  Type,
  TypeDefinition,
  TypeName,
  UnionDefinition,
} from "./ir-types.js";

export {
  bodyArg,
  createAliasDef,
  createEndpoint,
  createEnumDef,
  createObjectDef,
  headerArg,
  listType,
  mapType,
  optionalType,
  pathArg,
  primitiveType,
  queryArg,
  referenceType,
  setType,
  typeName,
} from "./ir-builders.js";

export type { ValidationResult } from "./ir-validator.js";
export { validateIr } from "./ir-validator.js";

export {
  getAllEndpoints,
  getAllTypeNames,
  getTypeDefinition,
  isAliasDefinition,
  isEnumDefinition,
  isObjectDefinition,
  isUnionDefinition,
  resolveType,
} from "./ir-utils.js";
