import type { TypeName } from "@openfoundry/conjure-ir";
import * as path from "node:path";

/**
 * Converts a PascalCase or camelCase name to kebab-case.
 *
 * Examples:
 * - `OntologyV2` → `ontology-v2`
 * - `MyServiceClient` → `my-service-client`
 * - `HTMLParser` → `html-parser`
 */
export function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Converts a PascalCase name to camelCase.
 *
 * Examples:
 * - `GetResource` → `getResource`
 * - `ID` → `id`
 */
export function toCamelCase(name: string): string {
  if (name.length === 0) return name;
  // If the entire string is uppercase (e.g. "ID"), lowercase the whole thing
  if (/^[A-Z]+$/.test(name)) return name.toLowerCase();
  return name[0].toLowerCase() + name.slice(1);
}

/**
 * Generates a file name (without directory) from a TypeName.
 * Uses kebab-case with a `.ts` extension.
 */
export function toFileName(typeName: TypeName): string {
  return `${toKebabCase(typeName.name)}.ts`;
}

/**
 * Computes a relative import path from one generated file to another.
 * Both paths should be relative to the same output root.
 * Returns a path suitable for TypeScript imports (no `.ts` extension, with `./` prefix).
 */
export function toImportPath(fromFile: string, toFile: string): string {
  const fromDir = path.dirname(fromFile);
  let relative = path.posix.relative(
    fromDir.replace(/\\/g, "/"),
    toFile.replace(/\\/g, "/"),
  );

  // Remove .ts extension for import
  relative = relative.replace(/\.ts$/, "");

  // Ensure it starts with ./ or ../
  if (!relative.startsWith(".")) {
    relative = `./${relative}`;
  }

  return relative;
}
