import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileConjureFile, compileConjureFiles } from "../../packages/conjure-compiler/src/index.js";
import { generateFromIr } from "../../packages/conjure-codegen/src/index.js";

const CONJURE_DIR = join(__dirname, "../../conjure");

describe("Conjure Pipeline: YAML → IR → TypeScript", () => {
  it("compiles common-types.yml to IR", () => {
    const yaml = readFileSync(join(CONJURE_DIR, "common-types.yml"), "utf-8");
    const ir = compileConjureFile(yaml, "common-types.yml");

    expect(ir).toBeDefined();
    expect(ir.types.length).toBeGreaterThan(0);

    const typeNames = ir.types.map((t) => {
      if ("typeName" in t) return t.typeName.name;
      return "";
    });
    expect(typeNames).toContain("Rid");
    expect(typeNames).toContain("PageToken");
  });

  it("compiles ontology-service.yml to IR with services", () => {
    const yaml = readFileSync(join(CONJURE_DIR, "ontology-service.yml"), "utf-8");
    const ir = compileConjureFile(yaml, "ontology-service.yml");

    expect(ir.services.length).toBeGreaterThan(0);
    expect(ir.types.length).toBeGreaterThan(0);
  });

  it("generates TypeScript from compiled IR", () => {
    const yaml = readFileSync(join(CONJURE_DIR, "common-types.yml"), "utf-8");
    const ir = compileConjureFile(yaml, "common-types.yml");
    const files = generateFromIr(ir);

    expect(files.length).toBeGreaterThan(0);
    const hasTypeDeclarations = files.some(
      (f) => f.content.includes("export interface") || f.content.includes("export type"),
    );
    expect(hasTypeDeclarations).toBe(true);
  });

  it("full pipeline: compile all YAML files → merge → generate", () => {
    const yamlFiles = readdirSync(CONJURE_DIR).filter((f) => f.endsWith(".yml"));
    expect(yamlFiles.length).toBeGreaterThan(0);

    const inputs = yamlFiles.map((file) => ({
      filename: file,
      content: readFileSync(join(CONJURE_DIR, file), "utf-8"),
    }));

    const mergedIr = compileConjureFiles(inputs);
    expect(mergedIr.types.length).toBeGreaterThan(0);
    expect(mergedIr.services.length).toBeGreaterThan(0);

    const files = generateFromIr(mergedIr);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => typeof f.content === "string")).toBe(true);
  });
});
