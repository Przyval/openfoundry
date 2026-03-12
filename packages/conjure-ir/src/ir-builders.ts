/**
 * Builder helpers for constructing Conjure IR structures programmatically.
 */

import type {
  AliasDefinition,
  ArgumentDefinition,
  AuthType,
  EndpointDefinition,
  EnumDefinition,
  FieldDefinition,
  HttpMethod,
  ObjectDefinition,
  PrimitiveType,
  Type,
  TypeName,
} from "./ir-types.js";

/** Create a primitive type reference. */
export function primitiveType(p: PrimitiveType): Type {
  return { type: "primitive", primitive: p };
}

/** Create an optional type wrapping the given item type. */
export function optionalType(itemType: Type): Type {
  return { type: "optional", optional: { itemType } };
}

/** Create a list type wrapping the given item type. */
export function listType(itemType: Type): Type {
  return { type: "list", list: { itemType } };
}

/** Create a set type wrapping the given item type. */
export function setType(itemType: Type): Type {
  return { type: "set", set: { itemType } };
}

/** Create a map type with the given key and value types. */
export function mapType(keyType: Type, valueType: Type): Type {
  return { type: "map", map: { keyType, valueType } };
}

/** Create a reference to a named type. */
export function referenceType(name: string, pkg: string): Type {
  return { type: "reference", reference: { name, package: pkg } };
}

/** Create a TypeName. */
export function typeName(name: string, pkg: string): TypeName {
  return { name, package: pkg };
}

/** Create an ObjectDefinition. */
export function createObjectDef(
  name: string,
  pkg: string,
  fields: FieldDefinition[],
  docs?: string,
): ObjectDefinition {
  return {
    typeName: typeName(name, pkg),
    fields,
    ...(docs !== undefined ? { docs } : {}),
  };
}

/** Create an EnumDefinition from a list of value strings. */
export function createEnumDef(
  name: string,
  pkg: string,
  values: string[],
  docs?: string,
): EnumDefinition {
  return {
    typeName: typeName(name, pkg),
    values: values.map((v) => ({ value: v })),
    ...(docs !== undefined ? { docs } : {}),
  };
}

/** Create an AliasDefinition. */
export function createAliasDef(
  name: string,
  pkg: string,
  alias: Type,
  docs?: string,
): AliasDefinition {
  return {
    typeName: typeName(name, pkg),
    alias,
    ...(docs !== undefined ? { docs } : {}),
  };
}

/** Create an EndpointDefinition. */
export function createEndpoint(
  name: string,
  method: HttpMethod,
  path: string,
  options?: {
    args?: ArgumentDefinition[];
    returns?: Type;
    docs?: string;
    auth?: AuthType;
  },
): EndpointDefinition {
  return {
    endpointName: name,
    httpMethod: method,
    httpPath: path,
    args: options?.args ?? [],
    tags: [],
    markers: [],
    ...(options?.returns !== undefined ? { returns: options.returns } : {}),
    ...(options?.docs !== undefined ? { docs: options.docs } : {}),
    ...(options?.auth !== undefined ? { auth: options.auth } : {}),
  };
}

/** Create a body argument. */
export function bodyArg(name: string, type: Type): ArgumentDefinition {
  return {
    argName: name,
    type,
    paramType: { type: "body" },
    markers: [],
    tags: [],
  };
}

/** Create a path argument. */
export function pathArg(name: string, type: Type): ArgumentDefinition {
  return {
    argName: name,
    type,
    paramType: { type: "path" },
    markers: [],
    tags: [],
  };
}

/** Create a query argument. */
export function queryArg(
  name: string,
  paramId: string,
  type: Type,
): ArgumentDefinition {
  return {
    argName: name,
    type,
    paramType: { type: "query", query: { paramId } },
    markers: [],
    tags: [],
  };
}

/** Create a header argument. */
export function headerArg(
  name: string,
  paramId: string,
  type: Type,
): ArgumentDefinition {
  return {
    argName: name,
    type,
    paramType: { type: "header", header: { paramId } },
    markers: [],
    tags: [],
  };
}
