import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ConjureDefinition } from "@openfoundry/conjure-ir";
import { generateTypeFile } from "./type-generator.js";
import { generateServiceFile } from "./service-generator.js";
import { generateErrorFile } from "./error-generator.js";
import { generateIndexFile } from "./index-generator.js";

/** A file produced by the code generator. */
export interface GeneratedFile {
  /** Relative path for the generated file (e.g. `ontology-v2.ts`). */
  path: string;
  /** Full content of the generated file. */
  content: string;
}

/** Options controlling code generation behavior. */
export interface CodegenOptions {
  /** Base output directory for generated files. */
  outputDir?: string;
  /** Package name for generated code. */
  packageName?: string;
  /** Whether to generate service client classes. Defaults to `true`. */
  generateServices?: boolean;
  /** Whether to generate type definitions. Defaults to `true`. */
  generateTypes?: boolean;
}

/**
 * Generates TypeScript source files from a Conjure IR definition.
 *
 * Produces one file per type, one file per service, one file per error,
 * and a barrel index file re-exporting everything.
 */
export function generateFromIr(
  ir: ConjureDefinition,
  options?: CodegenOptions,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const shouldGenerateTypes = options?.generateTypes !== false;
  const shouldGenerateServices = options?.generateServices !== false;

  // Generate type files
  if (shouldGenerateTypes) {
    for (const typeDef of ir.types) {
      files.push(generateTypeFile(typeDef));
    }
  }

  // Generate error files
  if (shouldGenerateTypes) {
    for (const errorDef of ir.errors) {
      files.push(generateErrorFile(errorDef));
    }
  }

  // Generate service files
  if (shouldGenerateServices) {
    for (const serviceDef of ir.services) {
      files.push(generateServiceFile(serviceDef, ir.types));
    }
  }

  // Generate index file
  const indexFile = generateIndexFile(files);
  files.push(indexFile);

  return files;
}

/**
 * Writes all generated files to disk under the given output directory.
 * Creates directories as needed.
 */
export async function writeGeneratedFiles(
  files: GeneratedFile[],
  outputDir: string,
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  for (const file of files) {
    const fullPath = path.join(outputDir, file.path);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, file.content, "utf-8");
  }
}
