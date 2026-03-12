import { defineConfig } from "vitest/config";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

// Build resolve aliases for all @openfoundry/* workspace packages so that
// vitest can import from source even when pnpm hasn't linked every package
// into every service's node_modules.
const packagesDir = resolve(__dirname, "../packages");
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
    root: "./tests",
    include: ["integration/**/*.test.ts"],
    testTimeout: 30000,
  },
});
