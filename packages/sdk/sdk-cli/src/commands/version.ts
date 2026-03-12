import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { log, bold } from "../output.js";
import type { ParsedArgs } from "../cli.js";

function getPackageVersion(): string {
  try {
    // Resolve relative to this file's location (dist/commands/version.js -> package.json)
    const thisFile = fileURLToPath(import.meta.url);
    const packageDir = path.resolve(path.dirname(thisFile), "..", "..");
    const packageJsonPath = path.join(packageDir, "package.json");

    if (fs.existsSync(packageJsonPath)) {
      const raw = fs.readFileSync(packageJsonPath, "utf-8");
      const pkg = JSON.parse(raw) as { version: string };
      return pkg.version;
    }
  } catch {
    // Fall through
  }

  return "0.0.1";
}

export async function handleVersion(_args: ParsedArgs): Promise<void> {
  const version = getPackageVersion();
  log(`${bold("openfoundry")} v${version}`);
}
