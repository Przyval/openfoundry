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

/**
 * The conjure YAML is this repository's own declared API contract: the
 * compiler and codegen turn it into the shipped SDK, so a parameter a handler
 * accepts but the definition omits cannot be sent by a generated client.
 *
 * These assertions read the compiled IR - a typed semantic model - rather than
 * the YAML text.
 */
describe("Conjure definitions declare the supported query parameters", () => {
  function queryParams(file: string, endpointName: string): string[] {
    const ir = compileConjureFile(
      readFileSync(join(CONJURE_DIR, file), "utf-8"),
      file,
    );
    for (const service of ir.services) {
      const endpoint = service.endpoints.find(
        (e) => e.endpointName === endpointName,
      );
      if (endpoint) {
        return endpoint.args
          .filter((a) => a.paramType.type === "query")
          .map((a) => a.argName)
          .sort();
      }
    }
    throw new Error(`endpoint ${endpointName} not found in ${file}`);
  }

  it("declares the object read parameters on listObjects", () => {
    expect(queryParams("object-service.yml", "listObjects")).toEqual([
      "excludeRid",
      "orderBy",
      "pageSize",
      "pageToken",
      "select",
      "snapshot",
    ]);
  });

  it("declares the object read parameters on getObject", () => {
    expect(queryParams("object-service.yml", "getObject")).toEqual([
      "excludeRid",
      "select",
    ]);
  });

  it("declares the object read parameters on getLinks", () => {
    expect(queryParams("object-service.yml", "getLinks")).toEqual([
      "excludeRid",
      "orderBy",
      "pageSize",
      "pageToken",
      "select",
      "snapshot",
    ]);
  });

  it("declares executeInMemoryOnly on the object-set operations", () => {
    expect(queryParams("object-service.yml", "loadObjects")).toEqual([
      "executeInMemoryOnly",
    ]);
    expect(queryParams("object-service.yml", "aggregate")).toEqual([
      "executeInMemoryOnly",
    ]);
  });

  it("declares the user lifecycle parameters", () => {
    expect(queryParams("admin-service.yml", "listUsers")).toEqual([
      "include",
      "pageSize",
      "pageToken",
    ]);
    expect(queryParams("admin-service.yml", "getUser")).toEqual(["status"]);
  });

  it("declares includeDatasources on the object-type operations", () => {
    expect(queryParams("ontology-service.yml", "listObjectTypes")).toEqual([
      "includeDatasources",
      "pageSize",
      "pageToken",
    ]);
    expect(queryParams("ontology-service.yml", "getObjectType")).toEqual([
      "includeDatasources",
    ]);
  });

  it("declares the datasources field the includeDatasources flag produces", () => {
    const ir = compileConjureFile(
      readFileSync(join(CONJURE_DIR, "ontology-service.yml"), "utf-8"),
      "ontology-service.yml",
    );
    const objectType = ir.types.find(
      (t) => "typeName" in t && t.typeName.name === "ObjectTypeV2",
    );
    const fields = (objectType as { fields: { fieldName: string; type: unknown }[] })
      .fields;
    const datasources = fields.find((f) => f.fieldName === "datasources");

    expect(datasources).toBeDefined();
    expect(datasources!.type).toEqual({
      type: "optional",
      optional: {
        itemType: {
          type: "list",
          list: { itemType: { type: "primitive", primitive: "ANY" } },
        },
      },
    });
  });

  it("declares includeActionTypeFullMetadata on the full-metadata operation", () => {
    expect(
      queryParams("ontology-service.yml", "getOntologyFullMetadata"),
    ).toEqual(["includeActionTypeFullMetadata"]);
  });

  it("declares pathPrefix on listFiles, and nothing the handler withdrew", () => {
    expect(queryParams("dataset-service.yml", "listFiles")).toEqual([
      "pageSize",
      "pageToken",
      "pathPrefix",
    ]);
  });

  it("declares no ontology scoping parameter the services reject", () => {
    const ir = compileConjureFile(
      readFileSync(join(CONJURE_DIR, "object-service.yml"), "utf-8"),
      "object-service.yml",
    );
    const declared = ir.services.flatMap((s) =>
      s.endpoints.flatMap((e) =>
        e.args.filter((a) => a.paramType.type === "query").map((a) => a.argName),
      ),
    );
    for (const rejected of ["branch", "scenarioRid", "transactionId"]) {
      expect(declared).not.toContain(rejected);
    }
  });
});
