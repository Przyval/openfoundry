#!/usr/bin/env node

import { handleAuth } from "./commands/auth.js";
import { handleGenerate } from "./commands/generate.js";
import { handleSite } from "./commands/site.js";
import { handleVersion } from "./commands/version.js";
import { handleHelp } from "./commands/help.js";
import { error } from "./output.js";

export interface ParsedArgs {
  command: string;
  subcommand: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  // Skip node and script path
  const args = argv.slice(2);

  const command = args[0] ?? "help";
  const subcommand = args[1] && !args[1].startsWith("-") ? args[1] : "";
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  const startIndex = subcommand ? 2 : 1;

  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, subcommand, positional, flags };
}

const COMMANDS: Record<string, (args: ParsedArgs) => Promise<void>> = {
  auth: handleAuth,
  generate: handleGenerate,
  site: handleSite,
  version: handleVersion,
  help: handleHelp,
};

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed.flags["version"] || parsed.flags["v"]) {
    await handleVersion(parsed);
    return;
  }

  if (parsed.flags["help"] || parsed.flags["h"]) {
    await handleHelp(parsed);
    return;
  }

  const handler = COMMANDS[parsed.command];
  if (!handler) {
    error(`Unknown command: ${parsed.command}`);
    error('Run "openfoundry help" for usage information.');
    process.exitCode = 1;
    return;
  }

  try {
    await handler(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

main();
