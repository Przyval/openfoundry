import type { GeneratedFile } from "./codegen.js";

/**
 * Generates a barrel export index file that re-exports all generated
 * types, services, and error classes.
 */
export function generateIndexFile(files: GeneratedFile[]): GeneratedFile {
  const lines: string[] = [];

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const importPath = `./${file.path.replace(/\.ts$/, "")}`;
    lines.push(`export * from "${importPath}";`);
  }
  lines.push("");

  return {
    path: "index.ts",
    content: lines.join("\n"),
  };
}
