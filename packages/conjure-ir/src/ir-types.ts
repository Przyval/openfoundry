/**
 * Complete Conjure IR type definitions.
 *
 * The Conjure IR is the JSON format produced by the Conjure compiler
 * after parsing YAML definitions. These types model the full IR spec
 * as defined by Palantir's Conjure specification.
 */

/** Root IR document */
export interface ConjureDefinition {
  version: number;
  errors: ErrorDefinition[];
  types: TypeDefinition[];
  services: ServiceDefinition[];
  extensions: Record<string, unknown>;
}

/** Type definition — discriminated union */
export type TypeDefinition =
  | AliasDefinition
  | EnumDefinition
  | ObjectDefinition
  | UnionDefinition;

export interface TypeName {
  name: string;
  package: string;
}

/** Alias: newtype wrapper */
export interface AliasDefinition {
  typeName: TypeName;
  alias: Type;
  docs?: string;
  safety?: LogSafety;
}

/** Enum: fixed set of values */
export interface EnumDefinition {
  typeName: TypeName;
  values: EnumValueDefinition[];
  docs?: string;
}

export interface EnumValueDefinition {
  value: string;
  docs?: string;
  deprecated?: DeprecatedInfo;
}

/** Object: named fields */
export interface ObjectDefinition {
  typeName: TypeName;
  fields: FieldDefinition[];
  docs?: string;
}

export interface FieldDefinition {
  fieldName: string;
  type: Type;
  docs?: string;
  safety?: LogSafety;
  deprecated?: DeprecatedInfo;
}

/** Union: tagged discriminated union */
export interface UnionDefinition {
  typeName: TypeName;
  union: FieldDefinition[];
  docs?: string;
}

/** Primitive types */
export type PrimitiveType =
  | "STRING"
  | "INTEGER"
  | "DOUBLE"
  | "BOOLEAN"
  | "SAFELONG"
  | "DATETIME"
  | "RID"
  | "BEARERTOKEN"
  | "BINARY"
  | "ANY"
  | "UUID";

/** Type reference — discriminated union */
export type Type =
  | { type: "primitive"; primitive: PrimitiveType }
  | { type: "optional"; optional: { itemType: Type } }
  | { type: "list"; list: { itemType: Type } }
  | { type: "set"; set: { itemType: Type } }
  | { type: "map"; map: { keyType: Type; valueType: Type } }
  | { type: "reference"; reference: TypeName }
  | { type: "external"; external: { externalReference: TypeName; fallback: Type } };

/** Service definition */
export interface ServiceDefinition {
  serviceName: TypeName;
  endpoints: EndpointDefinition[];
  docs?: string;
}

/** HTTP method */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** Endpoint definition */
export interface EndpointDefinition {
  endpointName: string;
  httpMethod: HttpMethod;
  httpPath: string;
  auth?: AuthType;
  args: ArgumentDefinition[];
  returns?: Type;
  docs?: string;
  deprecated?: DeprecatedInfo;
  tags: string[];
  markers: Type[];
}

/** Argument definition */
export interface ArgumentDefinition {
  argName: string;
  type: Type;
  paramType: ParamType;
  docs?: string;
  safety?: LogSafety;
  markers: Type[];
  tags: string[];
}

/** Parameter location */
export type ParamType =
  | { type: "body" }
  | { type: "header"; header: { paramId: string } }
  | { type: "path" }
  | { type: "query"; query: { paramId: string } };

/** Auth type */
export type AuthType =
  | { type: "header" }
  | { type: "cookie"; cookie: { cookieName: string } }
  | { type: "none" };

/** Error definition */
export interface ErrorDefinition {
  errorName: TypeName;
  namespace: string;
  code: ErrorCode;
  safeArgs: FieldDefinition[];
  unsafeArgs: FieldDefinition[];
  docs?: string;
}

export type ErrorCode =
  | "PERMISSION_DENIED"
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REQUEST_ENTITY_TOO_LARGE"
  | "FAILED_PRECONDITION"
  | "INTERNAL"
  | "TIMEOUT"
  | "CUSTOM_CLIENT"
  | "CUSTOM_SERVER";

export type LogSafety = "SAFE" | "UNSAFE" | "DO_NOT_LOG";

export interface DeprecatedInfo {
  docs: string;
}
