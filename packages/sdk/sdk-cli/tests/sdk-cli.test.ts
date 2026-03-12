import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseArgs } from "../src/cli.js";
import { CredentialStore } from "../src/config/credentials.js";
import type { Credentials } from "../src/config/credentials.js";
import { loadProjectConfig } from "../src/config/project-config.js";
import { getGeneralHelpText } from "../src/commands/help.js";
import { table } from "../src/output.js";

// ─── Arg Parsing ─────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("should extract the command from argv", () => {
    const result = parseArgs(["node", "cli.js", "auth"]);
    expect(result.command).toBe("auth");
  });

  it("should extract command and subcommand", () => {
    const result = parseArgs(["node", "cli.js", "auth", "login"]);
    expect(result.command).toBe("auth");
    expect(result.subcommand).toBe("login");
  });

  it("should parse long flags with values", () => {
    const result = parseArgs([
      "node",
      "cli.js",
      "generate",
      "types",
      "--output-dir",
      "out",
    ]);
    expect(result.command).toBe("generate");
    expect(result.subcommand).toBe("types");
    expect(result.flags["output-dir"]).toBe("out");
  });

  it("should parse long flags with equals syntax", () => {
    const result = parseArgs([
      "node",
      "cli.js",
      "generate",
      "types",
      "--output-dir=out",
    ]);
    expect(result.flags["output-dir"]).toBe("out");
  });

  it("should parse boolean flags", () => {
    const result = parseArgs(["node", "cli.js", "help", "--version"]);
    expect(result.flags["version"]).toBe(true);
  });

  it("should parse short flags", () => {
    const result = parseArgs(["node", "cli.js", "auth", "-v"]);
    expect(result.flags["v"]).toBe(true);
  });

  it("should collect positional arguments after command/subcommand", () => {
    const result = parseArgs([
      "node",
      "cli.js",
      "site",
      "delete",
      "site-123",
    ]);
    expect(result.command).toBe("site");
    expect(result.subcommand).toBe("delete");
    expect(result.positional).toContain("site-123");
  });

  it("should default command to help when no args provided", () => {
    const result = parseArgs(["node", "cli.js"]);
    expect(result.command).toBe("help");
  });

  it("should handle multiple long flags", () => {
    const result = parseArgs([
      "node",
      "cli.js",
      "generate",
      "types",
      "--output-dir",
      "out",
      "--conjure-dir",
      "schemas",
    ]);
    expect(result.flags["output-dir"]).toBe("out");
    expect(result.flags["conjure-dir"]).toBe("schemas");
  });

  it("should handle short flag with value", () => {
    const result = parseArgs(["node", "cli.js", "auth", "-o", "output.json"]);
    expect(result.flags["o"]).toBe("output.json");
  });

  it("should return empty subcommand when second arg starts with dash", () => {
    const result = parseArgs(["node", "cli.js", "auth", "--verbose"]);
    expect(result.command).toBe("auth");
    expect(result.subcommand).toBe("");
    expect(result.flags["verbose"]).toBe(true);
  });

  it("should return empty positional array when no positional args", () => {
    const result = parseArgs(["node", "cli.js", "help"]);
    expect(result.positional).toEqual([]);
  });
});

// ─── Credential Store ────────────────────────────────────────────────────────

describe("CredentialStore", () => {
  let tmpDir: string;
  let store: CredentialStore;

  const testCreds: Credentials = {
    accessToken: "test-access-token-abc123",
    refreshToken: "test-refresh-token-xyz789",
    expiresAt: Date.now() + 3600 * 1000,
    baseUrl: "https://app.openfoundry.dev",
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "of-cli-test-"));
    store = new CredentialStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return null when no credentials exist", () => {
    expect(store.loadCredentials()).toBeNull();
  });

  it("should save and load credentials", () => {
    store.saveCredentials(testCreds);
    const loaded = store.loadCredentials();
    expect(loaded).not.toBeNull();
    expect(loaded!.accessToken).toBe(testCreds.accessToken);
    expect(loaded!.refreshToken).toBe(testCreds.refreshToken);
    expect(loaded!.expiresAt).toBe(testCreds.expiresAt);
    expect(loaded!.baseUrl).toBe(testCreds.baseUrl);
  });

  it("should clear credentials", () => {
    store.saveCredentials(testCreds);
    expect(store.loadCredentials()).not.toBeNull();
    store.clearCredentials();
    expect(store.loadCredentials()).toBeNull();
  });

  it("should report token as expired when no credentials", () => {
    expect(store.isTokenExpired()).toBe(true);
  });

  it("should report token as not expired for valid credentials", () => {
    store.saveCredentials(testCreds);
    expect(store.isTokenExpired()).toBe(false);
  });

  it("should report token as expired when past expiry", () => {
    store.saveCredentials({
      ...testCreds,
      expiresAt: Date.now() - 1000,
    });
    expect(store.isTokenExpired()).toBe(true);
  });

  it("should overwrite existing credentials on save", () => {
    store.saveCredentials(testCreds);
    const newCreds: Credentials = {
      ...testCreds,
      accessToken: "updated-token",
    };
    store.saveCredentials(newCreds);
    const loaded = store.loadCredentials();
    expect(loaded!.accessToken).toBe("updated-token");
  });
});

// ─── Project Config ──────────────────────────────────────────────────────────

describe("loadProjectConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "of-cli-config-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return defaults when no config file exists", () => {
    const config = loadProjectConfig(tmpDir);
    expect(config.conjureDir).toBe("conjure");
    expect(config.outputDir).toBe("src/generated");
    expect(config.ontologyFile).toBe("ontology.yaml");
    expect(config.baseUrl).toBe("https://app.openfoundry.dev");
  });

  it("should merge user config with defaults", () => {
    const userConfig = {
      baseUrl: "https://custom.openfoundry.dev",
      conjureDir: "schemas",
    };
    fs.writeFileSync(
      path.join(tmpDir, "foundry.config.json"),
      JSON.stringify(userConfig),
    );
    const config = loadProjectConfig(tmpDir);
    expect(config.baseUrl).toBe("https://custom.openfoundry.dev");
    expect(config.conjureDir).toBe("schemas");
    expect(config.outputDir).toBe("src/generated"); // default preserved
  });

  it("should preserve all defaults when config has partial overrides", () => {
    const userConfig = { outputDir: "custom-output" };
    fs.writeFileSync(
      path.join(tmpDir, "foundry.config.json"),
      JSON.stringify(userConfig),
    );
    const config = loadProjectConfig(tmpDir);
    expect(config.outputDir).toBe("custom-output");
    expect(config.conjureDir).toBe("conjure");
    expect(config.ontologyFile).toBe("ontology.yaml");
    expect(config.baseUrl).toBe("https://app.openfoundry.dev");
  });
});

// ─── Help Text ───────────────────────────────────────────────────────────────

describe("help text", () => {
  it("should include all top-level commands", () => {
    const text = getGeneralHelpText();
    expect(text).toContain("auth");
    expect(text).toContain("generate");
    expect(text).toContain("site");
    expect(text).toContain("version");
    expect(text).toContain("help");
  });

  it("should include usage pattern", () => {
    const text = getGeneralHelpText();
    expect(text).toContain("openfoundry <command>");
  });

  it("should return a non-empty string", () => {
    const text = getGeneralHelpText();
    expect(text.length).toBeGreaterThan(0);
  });
});

// ─── Output Formatting ──────────────────────────────────────────────────────

describe("table", () => {
  it("should format a table with headers and rows", () => {
    const output = table(
      ["Name", "Value"],
      [
        ["foo", "bar"],
        ["baz", "qux"],
      ],
    );
    expect(output).toContain("Name");
    expect(output).toContain("Value");
    expect(output).toContain("foo");
    expect(output).toContain("bar");
    expect(output).toContain("baz");
    expect(output).toContain("qux");
    // Should have separator line
    expect(output).toContain("─");
  });

  it("should handle empty rows", () => {
    const output = table(["Name", "Value"], []);
    expect(output).toContain("Name");
    expect(output).toContain("Value");
  });
});

// ─── Generate Command Dispatch ───────────────────────────────────────────────

describe("generate command dispatching", () => {
  it("should parse generate types with flags", () => {
    const args = parseArgs([
      "node",
      "cli.js",
      "generate",
      "types",
      "--conjure-dir",
      "my-schemas",
      "--output-dir",
      "my-output",
    ]);
    expect(args.command).toBe("generate");
    expect(args.subcommand).toBe("types");
    expect(args.flags["conjure-dir"]).toBe("my-schemas");
    expect(args.flags["output-dir"]).toBe("my-output");
  });

  it("should parse generate ontology with flags", () => {
    const args = parseArgs([
      "node",
      "cli.js",
      "generate",
      "ontology",
      "--ontology-file",
      "my-ontology.yaml",
    ]);
    expect(args.command).toBe("generate");
    expect(args.subcommand).toBe("ontology");
    expect(args.flags["ontology-file"]).toBe("my-ontology.yaml");
  });
});

// ─── CLI module structure ────────────────────────────────────────────────────

describe("CLI module structure", () => {
  it("parseArgs returns correct shape", () => {
    const result = parseArgs(["node", "cli.js", "help"]);
    expect(result).toHaveProperty("command");
    expect(result).toHaveProperty("subcommand");
    expect(result).toHaveProperty("positional");
    expect(result).toHaveProperty("flags");
    expect(typeof result.command).toBe("string");
    expect(typeof result.subcommand).toBe("string");
    expect(Array.isArray(result.positional)).toBe(true);
    expect(typeof result.flags).toBe("object");
  });

  it("parseArgs flags object is a plain record", () => {
    const result = parseArgs(["node", "cli.js", "auth", "--verbose", "--format", "json"]);
    expect(result.flags["verbose"]).toBe(true);
    expect(result.flags["format"]).toBe("json");
  });
});
