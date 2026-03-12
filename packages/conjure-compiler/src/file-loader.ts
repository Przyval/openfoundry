import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import type { ConjureDefinition } from "@openfoundry/conjure-ir";
import { compileConjureFile, mergeDefinitions } from "./compiler.js";

/**
 * Load and compile all `.yml` / `.yaml` files from a directory, merging
 * the results into a single `ConjureDefinition`.
 */
export async function loadConjureDirectory(dirPath: string): Promise<ConjureDefinition> {
  const entries = await readdir(dirPath);
  const yamlFiles = entries
    .filter((f) => {
      const ext = extname(f).toLowerCase();
      return ext === ".yml" || ext === ".yaml";
    })
    .sort(); // deterministic ordering

  if (yamlFiles.length === 0) {
    return { version: 1, errors: [], types: [], services: [], extensions: {} };
  }

  const defs: ConjureDefinition[] = [];
  for (const file of yamlFiles) {
    const content = await readFile(join(dirPath, file), "utf-8");
    defs.push(compileConjureFile(content, file));
  }

  return mergeDefinitions(defs);
}

/**
 * Load and compile a single Conjure YAML file from disk.
 */
export async function loadConjureFile(filePath: string): Promise<ConjureDefinition> {
  const content = await readFile(filePath, "utf-8");
  const filename = filePath.split("/").pop() ?? filePath;
  return compileConjureFile(content, filename);
}
