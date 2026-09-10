import { defineConfig } from "vitest/config";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

// Build resolve aliases for all @openfoundry/* workspace packages so that
// vitest can import from source even when pnpm hasn't linked every package.
const packagesDir = resolve(__dirname, "packages");
const packageAliases: Record<string, string> = {};
for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
  if (dir.isDirectory()) {
    packageAliases[`@openfoundry/${dir.name}`] = resolve(
      packagesDir,
      dir.name,
      "src/index.ts",
    );
  }
}

export default defineConfig({
  resolve: {
    alias: packageAliases,
  },
  test: {
    // Relative to the run's root, which is the repo root for a root-level run
    // but the package directory when a workspace package runs `vitest` and
    // inherits this config. Root-anchored globs (`packages/**`) match nothing
    // in the latter case, which made every package fail with "No test files".
    include: ["**/tests/**/*.test.ts", "**/src/**/*.test.ts"],
    testTimeout: 30000,
  },
});
