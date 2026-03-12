import type {
  ArgumentDefinition,
  AuthType,
  ConjureDefinition,
  EndpointDefinition,
  EnumDefinition,
  FieldDefinition,
  ObjectDefinition,
  ParamType,
  ServiceDefinition,
  TypeDefinition,
  TypeName,
  AliasDefinition,
  UnionDefinition,
} from "@openfoundry/conjure-ir";
import { parseConjureYaml, type RawConjureFile, type RawFieldValue, type RawServiceDef, type RawTypeDef } from "./yaml-parser.js";
import { resolveTypeString } from "./type-resolver.js";
import { parseHttpString, extractPathParams } from "./http-parser.js";

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compile a single Conjure YAML string into a `ConjureDefinition`.
 */
export function compileConjureFile(yaml: string, filename?: string): ConjureDefinition {
  const raw = parseConjureYaml(yaml);
  return compileRaw(raw, filename);
}

/**
 * Compile multiple Conjure YAML files and merge them into a single
 * `ConjureDefinition`.
 */
export function compileConjureFiles(
  files: Array<{ filename: string; content: string }>,
): ConjureDefinition {
  const defs = files.map((f) => compileConjureFile(f.content, f.filename));
  return mergeDefinitions(defs);
}

/**
 * Merge an array of `ConjureDefinition` objects into one, concatenating
 * types, services, and errors. Throws on duplicate type names.
 */
export function mergeDefinitions(defs: ConjureDefinition[]): ConjureDefinition {
  const merged: ConjureDefinition = {
    version: 1,
    errors: [],
    types: [],
    services: [],
    extensions: {},
  };

  const seenTypes = new Map<string, string>(); // qualifiedName → source

  for (const def of defs) {
    // Check for duplicate types
    for (const td of def.types) {
      const tn = getTypeName(td);
      const qualName = `${tn.package}.${tn.name}`;
      const existing = seenTypes.get(qualName);
      if (existing !== undefined) {
        throw new Error(
          `Duplicate type definition: "${qualName}" (already defined${existing ? ` in ${existing}` : ""})`,
        );
      }
      seenTypes.set(qualName, def.extensions["source"] as string ?? "");
    }

    merged.errors.push(...def.errors);
    merged.types.push(...def.types);
    merged.services.push(...def.services);

    // Merge extensions
    for (const [k, v] of Object.entries(def.extensions)) {
      if (k !== "source") {
        merged.extensions[k] = v;
      }
    }
  }

  return merged;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function getTypeName(td: TypeDefinition): TypeName {
  return td.typeName;
}

function compileRaw(raw: RawConjureFile, filename?: string): ConjureDefinition {
  const types: TypeDefinition[] = [];
  const services: ServiceDefinition[] = [];

  if (raw.types?.definitions) {
    const defs = raw.types.definitions;
    const defaultPackage = defs["default-package"];
    const objects = defs.objects ?? {};

    for (const [name, rawDef] of Object.entries(objects)) {
      types.push(compileTypeDef(name, rawDef, defaultPackage));
    }
  }

  if (raw.services) {
    const defaultPkg = raw.types?.definitions?.["default-package"] ?? "";
    for (const [key, rawSvc] of Object.entries(raw.services)) {
      services.push(compileService(key, rawSvc, defaultPkg));
    }
  }

  return {
    version: 1,
    errors: [],
    types,
    services,
    extensions: filename ? { source: filename } : {},
  };
}

// ── Type compilation ────────────────────────────────────────────────────────

function compileTypeDef(
  name: string,
  raw: RawTypeDef,
  defaultPackage: string,
): TypeDefinition {
  const typeName: TypeName = { name, package: defaultPackage };

  // Alias: has `alias` key
  if (raw.alias !== undefined) {
    const def: AliasDefinition = {
      typeName,
      alias: resolveTypeString(raw.alias, defaultPackage),
    };
    if (raw.docs) def.docs = raw.docs;
    return def;
  }

  // Enum: has `values` key
  if (raw.values !== undefined) {
    const def: EnumDefinition = {
      typeName,
      values: raw.values.map((v) => ({ value: v })),
    };
    if (raw.docs) def.docs = raw.docs;
    return def;
  }

  // Union: has `union` key
  if (raw.union !== undefined) {
    const def: UnionDefinition = {
      typeName,
      union: compileFields(raw.union, defaultPackage),
    };
    if (raw.docs) def.docs = raw.docs;
    return def;
  }

  // Object: has `fields` key (default)
  if (raw.fields !== undefined) {
    const def: ObjectDefinition = {
      typeName,
      fields: compileFields(raw.fields, defaultPackage),
    };
    if (raw.docs) def.docs = raw.docs;
    return def;
  }

  throw new Error(`Cannot determine type kind for "${name}": must have alias, values, union, or fields`);
}

function compileFields(
  rawFields: Record<string, RawFieldValue>,
  defaultPackage: string,
): FieldDefinition[] {
  return Object.entries(rawFields).map(([fieldName, rawField]) => {
    const typeStr = typeof rawField === "string" ? rawField : rawField.type;
    const docs = typeof rawField === "string" ? undefined : rawField.docs;

    const fd: FieldDefinition = {
      fieldName,
      type: resolveTypeString(typeStr, defaultPackage),
    };
    if (docs) fd.docs = docs;
    return fd;
  });
}

// ── Service compilation ─────────────────────────────────────────────────────

function compileService(
  key: string,
  raw: RawServiceDef,
  _fallbackPackage: string,
): ServiceDefinition {
  const pkg = raw.package;
  const basePath = raw["base-path"];
  const defaultAuth = resolveAuth(raw["default-auth"]);

  const endpoints: EndpointDefinition[] = [];

  for (const [epName, rawEp] of Object.entries(raw.endpoints)) {
    const { method, path: httpPath } = parseHttpString(rawEp.http);
    const fullPath = basePath + httpPath;

    const pathParams = new Set(extractPathParams(httpPath));

    const args: ArgumentDefinition[] = [];
    if (rawEp.args) {
      for (const [argName, rawArg] of Object.entries(rawEp.args)) {
        const typeStr = typeof rawArg === "string" ? rawArg : rawArg.type;
        const paramTypeStr = typeof rawArg === "string" ? undefined : rawArg["param-type"];
        const argDocs = typeof rawArg === "string" ? undefined : rawArg.docs;

        const paramType = resolveParamType(paramTypeStr, argName, pathParams);

        const argDef: ArgumentDefinition = {
          argName,
          type: resolveTypeString(typeStr, pkg),
          paramType,
          markers: [],
          tags: [],
        };
        if (argDocs) argDef.docs = argDocs;
        args.push(argDef);
      }
    }

    const ep: EndpointDefinition = {
      endpointName: epName,
      httpMethod: method,
      httpPath: fullPath,
      auth: defaultAuth,
      args,
      tags: [],
      markers: [],
    };
    if (rawEp.returns) {
      ep.returns = resolveTypeString(rawEp.returns, pkg);
    }
    if (rawEp.docs) {
      ep.docs = typeof rawEp.docs === "string" ? rawEp.docs.trim() : rawEp.docs;
    }

    endpoints.push(ep);
  }

  const svc: ServiceDefinition = {
    serviceName: { name: key, package: pkg },
    endpoints,
  };

  if (raw.name) {
    svc.docs = raw.name;
  }

  return svc;
}

function resolveAuth(authStr: string): AuthType {
  switch (authStr) {
    case "header":
      return { type: "header" };
    case "none":
      return { type: "none" };
    default:
      if (authStr.startsWith("cookie:")) {
        return { type: "cookie", cookie: { cookieName: authStr.slice(7).trim() } };
      }
      return { type: "header" };
  }
}

function resolveParamType(
  paramTypeStr: string | undefined,
  argName: string,
  pathParams: Set<string>,
): ParamType {
  if (paramTypeStr === "body") {
    return { type: "body" };
  }
  if (paramTypeStr === "path" || (!paramTypeStr && pathParams.has(argName))) {
    return { type: "path" };
  }
  if (paramTypeStr === "query" || !paramTypeStr) {
    return { type: "query", query: { paramId: argName } };
  }
  if (paramTypeStr === "header") {
    return { type: "header", header: { paramId: argName } };
  }
  return { type: "query", query: { paramId: argName } };
}
