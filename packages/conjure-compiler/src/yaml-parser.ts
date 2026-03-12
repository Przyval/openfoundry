import { parse as parseYaml } from "yaml";

// ── Raw YAML shape types ────────────────────────────────────────────────────

/**
 * A field can be specified as either a plain type string or an object with
 * `type`, `docs`, `param-type`, etc.
 */
export type RawFieldValue =
  | string
  | {
      type: string;
      docs?: string;
      "param-type"?: string;
      safety?: string;
      deprecated?: string;
    };

/**
 * A raw type definition as it appears in the YAML `objects` map.
 * Detection heuristic:
 *  - has `alias` key → AliasDefinition
 *  - has `values` key → EnumDefinition
 *  - has `union` key  → UnionDefinition
 *  - has `fields` key → ObjectDefinition
 */
export interface RawTypeDef {
  alias?: string;
  values?: string[];
  fields?: Record<string, RawFieldValue>;
  union?: Record<string, RawFieldValue>;
  docs?: string;
}

export interface RawImport {
  "base-type": string;
  external?: Record<string, string>;
  from?: string;
}

export interface RawDefinitions {
  "default-package": string;
  objects: Record<string, RawTypeDef>;
}

export interface RawEndpoint {
  http: string;
  args?: Record<string, RawFieldValue>;
  returns?: string;
  docs?: string;
}

export interface RawServiceDef {
  name: string;
  package: string;
  "base-path": string;
  "default-auth": string;
  endpoints: Record<string, RawEndpoint>;
}

export interface RawConjureFile {
  types?: {
    imports?: Record<string, RawImport>;
    definitions: RawDefinitions;
  };
  services?: Record<string, RawServiceDef>;
}

/**
 * Parse a Conjure YAML string into its raw typed representation.
 */
export function parseConjureYaml(yamlContent: string): RawConjureFile {
  const parsed = parseYaml(yamlContent) as RawConjureFile;
  if (parsed == null || typeof parsed !== "object") {
    throw new Error("Invalid Conjure YAML: expected a document object");
  }
  return parsed;
}
