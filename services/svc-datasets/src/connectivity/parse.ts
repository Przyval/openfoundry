import { invalidArgument } from "@openfoundry/errors";
import {
  hostNameCannotHaveProtocolOrPort,
  portNotInRange,
  propertyCannotBeBlank,
  propertyCannotBeEmpty,
} from "./errors.js";
import type { Json } from "./types.js";

/**
 * Small request-parsing helpers. `path` is the dotted location of the value in
 * the request body, so an error names exactly what was wrong.
 */

export function obj(raw: unknown, path: string): Json {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw invalidArgument(path, "is required and must be an object");
  }
  return raw as Json;
}

export function optionalObj(raw: unknown, path: string): Json | undefined {
  return raw === undefined || raw === null ? undefined : obj(raw, path);
}

/** A string that is present and not blank. */
export function str(o: Json, key: string, path: string): string {
  const at = `${path}${key}`;
  const value = o[key];
  if (typeof value !== "string") throw invalidArgument(at, "is required and must be a string");
  if (value.trim() === "") throw propertyCannotBeBlank(at);
  return value;
}

export function optionalStr(o: Json, key: string, path: string): string | undefined {
  return o[key] === undefined || o[key] === null ? undefined : str(o, key, path);
}

export function optionalBool(o: Json, key: string, path: string): boolean | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalidArgument(`${path}${key}`, "must be a boolean");
  return value;
}

export function requiredBool(o: Json, key: string, path: string): boolean {
  const value = optionalBool(o, key, path);
  if (value === undefined) throw invalidArgument(`${path}${key}`, "is required and must be a boolean");
  return value;
}

export function optionalInt(
  o: Json,
  key: string,
  path: string,
  min = Number.MIN_SAFE_INTEGER,
): number | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw invalidArgument(
      `${path}${key}`,
      min > Number.MIN_SAFE_INTEGER ? `must be an integer of at least ${min}` : "must be an integer",
    );
  }
  return value;
}

export function requiredInt(o: Json, key: string, path: string): number {
  const value = optionalInt(o, key, path);
  if (value === undefined) throw invalidArgument(`${path}${key}`, "is required and must be an integer");
  return value;
}

export function list(raw: unknown, path: string): unknown[] {
  if (!Array.isArray(raw)) throw invalidArgument(path, "is required and must be an array");
  return raw;
}

/** A required array that must hold at least one entry. */
export function nonEmptyList(raw: unknown, path: string): unknown[] {
  const items = list(raw, path);
  if (items.length === 0) throw propertyCannotBeEmpty(path);
  return items;
}

export function oneOf<T extends string>(
  o: Json,
  key: string,
  path: string,
  allowed: readonly T[],
): T {
  const value = o[key];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw invalidArgument(`${path}${key}`, `must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalOneOf<T extends string>(
  o: Json,
  key: string,
  path: string,
  allowed: readonly T[],
): T | undefined {
  return o[key] === undefined || o[key] === null ? undefined : oneOf(o, key, path, allowed);
}

/** A string-to-string map (`JdbcProperties`). */
export function stringMap(raw: unknown, path: string): Record<string, string> {
  const map = obj(raw, path);
  for (const [k, v] of Object.entries(map)) {
    if (typeof v !== "string") throw invalidArgument(`${path}.${k}`, "must be a string");
  }
  return map as Record<string, string>;
}

export function port(o: Json, key: string, path: string): number | undefined {
  const value = optionalInt(o, key, path);
  if (value !== undefined && (value < 1 || value > 65535)) throw portNotInRange(value);
  return value;
}

export function requiredPort(o: Json, key: string, path: string): number {
  const value = port(o, key, path);
  if (value === undefined) throw invalidArgument(`${path}${key}`, "is required and must be an integer");
  return value;
}

/** A host name: not blank, with no scheme and no port. */
export function hostName(o: Json, key: string, path: string): string {
  const value = str(o, key, path);
  if (value.includes("://") || value.includes(":") || value.includes("/")) {
    throw hostNameCannotHaveProtocolOrPort(value);
  }
  return value;
}

/** A body field the way the API names it, kept only when present. */
export function compact(entries: Json): Json {
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v !== undefined));
}

/**
 * Dispatch on the `type` discriminator of a union.
 *
 * @param table the parser for each accepted `type`
 */
export function byType<T>(
  raw: unknown,
  path: string,
  table: Record<string, (o: Json, path: string) => T>,
): T {
  const o = obj(raw, path);
  const type = o.type;
  const parse = typeof type === "string" && Object.hasOwn(table, type) ? table[type] : undefined;
  if (!parse) {
    throw invalidArgument(
      `${path}.type`,
      `must be one of ${Object.keys(table).join(", ")}, got ${JSON.stringify(type)}`,
    );
  }
  return parse(o, path);
}
