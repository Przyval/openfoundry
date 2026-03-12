import type { PrimitiveType, Type } from "@openfoundry/conjure-ir";

const PRIMITIVE_MAP: Record<string, PrimitiveType> = {
  string: "STRING",
  integer: "INTEGER",
  double: "DOUBLE",
  boolean: "BOOLEAN",
  safelong: "SAFELONG",
  datetime: "DATETIME",
  rid: "RID",
  bearertoken: "BEARERTOKEN",
  binary: "BINARY",
  any: "ANY",
  uuid: "UUID",
};

/**
 * Resolve a Conjure type string (e.g. `"optional<list<string>>"`) into a
 * structured `Type` value from the Conjure IR.
 *
 * Handles:
 *  - Primitives: `string`, `integer`, `double`, `boolean`, etc.
 *  - Wrapper generics: `optional<T>`, `list<T>`, `set<T>`
 *  - Map generics: `map<K, V>`
 *  - Named references: anything else → `{ type: "reference", ... }`
 *  - Arbitrarily nested generics
 */
export function resolveTypeString(typeStr: string, defaultPackage: string): Type {
  const trimmed = typeStr.trim();

  if (trimmed.length === 0) {
    throw new Error("Invalid type string: empty string");
  }

  // Check for generic wrappers
  const genericMatch = matchGeneric(trimmed);

  if (genericMatch !== null) {
    const { outer, inner } = genericMatch;
    const outerLower = outer.toLowerCase();

    switch (outerLower) {
      case "optional":
        return {
          type: "optional",
          optional: { itemType: resolveTypeString(inner, defaultPackage) },
        };
      case "list":
        return {
          type: "list",
          list: { itemType: resolveTypeString(inner, defaultPackage) },
        };
      case "set":
        return {
          type: "set",
          set: { itemType: resolveTypeString(inner, defaultPackage) },
        };
      case "map": {
        const [keyStr, valueStr] = splitMapArgs(inner);
        return {
          type: "map",
          map: {
            keyType: resolveTypeString(keyStr, defaultPackage),
            valueType: resolveTypeString(valueStr, defaultPackage),
          },
        };
      }
      default:
        throw new Error(`Unknown generic type wrapper: ${outer}`);
    }
  }

  // Primitive check — only match if the string is already all-lowercase.
  // A capitalised name like "Rid" is a user-defined reference, not the
  // primitive "rid".
  const lower = trimmed.toLowerCase();
  if (trimmed === lower && lower in PRIMITIVE_MAP) {
    return { type: "primitive", primitive: PRIMITIVE_MAP[lower] };
  }

  // If it contains invalid characters for a type name, reject
  if (/[<>,\s]/.test(trimmed)) {
    throw new Error(`Invalid type string: "${typeStr}"`);
  }

  // Named reference
  return {
    type: "reference",
    reference: { name: trimmed, package: defaultPackage },
  };
}

/**
 * Match the outermost generic `Name<...>` returning the outer name and inner
 * content, or `null` if the string is not a generic.
 */
function matchGeneric(s: string): { outer: string; inner: string } | null {
  const openIdx = s.indexOf("<");
  if (openIdx < 0) return null;

  // The string must end with >
  if (s[s.length - 1] !== ">") {
    throw new Error(`Invalid type string: unclosed generic in "${s}"`);
  }

  const outer = s.slice(0, openIdx).trim();
  const inner = s.slice(openIdx + 1, s.length - 1).trim();

  if (outer.length === 0) {
    throw new Error(`Invalid type string: empty generic name in "${s}"`);
  }

  return { outer, inner };
}

/**
 * Split the two type arguments of a `map<K, V>` respecting nested angle brackets.
 */
function splitMapArgs(inner: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "<") depth++;
    else if (ch === ">") depth--;
    else if (ch === "," && depth === 0) {
      const key = inner.slice(0, i).trim();
      const value = inner.slice(i + 1).trim();
      if (key.length === 0 || value.length === 0) {
        throw new Error(`Invalid map type arguments: "${inner}"`);
      }
      return [key, value];
    }
  }
  throw new Error(`Invalid map type: expected two type arguments separated by comma, got "${inner}"`);
}
