import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/", "**/node_modules/", "**/*.js", "**/*.mjs", "**/*.cjs"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The React apps carry `eslint-disable-next-line react-hooks/exhaustive-deps`
    // comments, so that rule has to actually exist here - without the plugin eslint
    // reports the suppression itself as an error.
    // Only the two classic hook rules are enabled. This plugin's `recommended` preset
    // also pulls in the React Compiler rules (set-state-in-effect, refs, immutability,
    // preserve-manual-memoization); adopting those is a separate call, not part of
    // turning lint on.
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Writing to stdout is the job here, not a slip: CLI scripts, long-running services
    // that log their own startup and scheduling, and test harnesses that report progress.
    files: ["scripts/**/*.{ts,mts,cts}", "services/**/*.{ts,mts,cts}", "tests/**/*.{ts,mts,cts}"],
    rules: { "no-console": "off" },
  },
  {
    // Library modules whose entire purpose is emitting to the console.
    files: [
      "packages/logging/src/logger.ts",
      "packages/redis/src/client.ts",
      "packages/sdk/sdk-cli/src/output.ts",
    ],
    rules: { "no-console": "off" },
  },
);
