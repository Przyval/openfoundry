import { log, bold, dim, cyan } from "../output.js";
import type { ParsedArgs } from "../cli.js";

interface CommandHelp {
  description: string;
  usage: string;
  subcommands?: Array<{ name: string; description: string }>;
  flags?: Array<{ name: string; description: string }>;
}

const COMMAND_HELP: Record<string, CommandHelp> = {
  auth: {
    description: "Manage authentication with OpenFoundry",
    usage: "openfoundry auth <subcommand>",
    subcommands: [
      { name: "login", description: "Authenticate with OpenFoundry via OAuth" },
      { name: "logout", description: "Remove saved credentials" },
      { name: "status", description: "Show current authentication status" },
      { name: "token", description: "Print the current access token" },
    ],
    flags: [
      { name: "--base-url <url>", description: "Override the OpenFoundry base URL" },
    ],
  },
  generate: {
    description: "Generate TypeScript code from definitions",
    usage: "openfoundry generate <subcommand>",
    subcommands: [
      { name: "types", description: "Generate TypeScript types from Conjure YAML" },
      { name: "ontology", description: "Generate typed SDK from ontology definition" },
    ],
    flags: [
      { name: "--conjure-dir <dir>", description: "Path to Conjure YAML directory (default: conjure)" },
      { name: "--output-dir <dir>", description: "Output directory for generated files (default: src/generated)" },
      { name: "--ontology-file <file>", description: "Path to ontology definition file (default: ontology.yaml)" },
    ],
  },
  site: {
    description: "Manage static site deployments",
    usage: "openfoundry site <subcommand>",
    subcommands: [
      { name: "deploy", description: "Deploy a static site to OpenFoundry" },
      { name: "list", description: "List deployed sites" },
      { name: "delete <siteId>", description: "Delete a deployed site" },
    ],
    flags: [
      { name: "--dir <path>", description: "Build directory to deploy (default: dist)" },
      { name: "--name <name>", description: "Site name" },
    ],
  },
  version: {
    description: "Print the CLI version",
    usage: "openfoundry version",
  },
  help: {
    description: "Show help information",
    usage: "openfoundry help [command]",
  },
};

function printGeneralHelp(): void {
  log("");
  log(bold("openfoundry") + " — CLI for OpenFoundry developers");
  log("");
  log(bold("USAGE"));
  log("  openfoundry <command> [subcommand] [flags]");
  log("");
  log(bold("COMMANDS"));

  const commands = Object.entries(COMMAND_HELP);
  const maxLen = Math.max(...commands.map(([name]) => name.length));

  for (const [name, help] of commands) {
    log(`  ${cyan(name.padEnd(maxLen + 2))} ${help.description}`);
  }

  log("");
  log(bold("FLAGS"));
  log(`  ${dim("--help, -h")}       Show help information`);
  log(`  ${dim("--version, -v")}    Show version`);
  log("");
  log(dim('Run "openfoundry help <command>" for detailed help on a command.'));
  log("");
}

function printCommandHelp(commandName: string): void {
  const help = COMMAND_HELP[commandName];

  if (!help) {
    log(`Unknown command: ${commandName}`);
    log('Run "openfoundry help" for a list of commands.');
    return;
  }

  log("");
  log(bold(`openfoundry ${commandName}`) + ` — ${help.description}`);
  log("");
  log(bold("USAGE"));
  log(`  ${help.usage}`);

  if (help.subcommands && help.subcommands.length > 0) {
    log("");
    log(bold("SUBCOMMANDS"));
    const maxLen = Math.max(...help.subcommands.map((s) => s.name.length));
    for (const sub of help.subcommands) {
      log(`  ${cyan(sub.name.padEnd(maxLen + 2))} ${sub.description}`);
    }
  }

  if (help.flags && help.flags.length > 0) {
    log("");
    log(bold("FLAGS"));
    const maxLen = Math.max(...help.flags.map((f) => f.name.length));
    for (const flag of help.flags) {
      log(`  ${dim(flag.name.padEnd(maxLen + 2))} ${flag.description}`);
    }
  }

  log("");
}

export function getGeneralHelpText(): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("openfoundry — CLI for OpenFoundry developers");
  lines.push("");
  lines.push("USAGE");
  lines.push("  openfoundry <command> [subcommand] [flags]");
  lines.push("");
  lines.push("COMMANDS");

  const commands = Object.entries(COMMAND_HELP);
  const maxLen = Math.max(...commands.map(([name]) => name.length));

  for (const [name, help] of commands) {
    lines.push(`  ${name.padEnd(maxLen + 2)} ${help.description}`);
  }

  lines.push("");
  lines.push("FLAGS");
  lines.push("  --help, -h       Show help information");
  lines.push("  --version, -v    Show version");
  lines.push("");
  return lines.join("\n");
}

export async function handleHelp(args: ParsedArgs): Promise<void> {
  const commandName = args.subcommand || args.positional[0];

  if (commandName) {
    printCommandHelp(commandName);
  } else {
    printGeneralHelp();
  }
}
