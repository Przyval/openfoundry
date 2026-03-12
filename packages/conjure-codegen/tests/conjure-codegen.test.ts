import { describe, it, expect } from "vitest";
import type {
  Type,
  ConjureDefinition,
  ObjectDefinition,
  EnumDefinition,
  AliasDefinition,
  UnionDefinition,
  ServiceDefinition,
  ErrorDefinition,
  TypeName,
} from "@openfoundry/conjure-ir";
import { typeToTypeScript, generateTypeFile } from "../src/type-generator.js";
import { generateServiceFile } from "../src/service-generator.js";
import { generateErrorFile } from "../src/error-generator.js";
import { generateIndexFile } from "../src/index-generator.js";
import { generateFromIr, type GeneratedFile } from "../src/codegen.js";
import { toKebabCase, toCamelCase, toFileName, toImportPath } from "../src/naming.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prim(primitive: string): Type {
  return { type: "primitive", primitive } as Type;
}

function ref(name: string, pkg = "com.example"): Type {
  return { type: "reference", reference: { name, package: pkg } };
}

function tn(name: string, pkg = "com.example"): TypeName {
  return { name, package: pkg };
}

// ---------------------------------------------------------------------------
// typeToTypeScript — Primitives
// ---------------------------------------------------------------------------

describe("typeToTypeScript", () => {
  it("maps STRING to string", () => {
    expect(typeToTypeScript(prim("STRING"))).toBe("string");
  });

  it("maps INTEGER to number", () => {
    expect(typeToTypeScript(prim("INTEGER"))).toBe("number");
  });

  it("maps DOUBLE to number", () => {
    expect(typeToTypeScript(prim("DOUBLE"))).toBe("number");
  });

  it("maps SAFELONG to number", () => {
    expect(typeToTypeScript(prim("SAFELONG"))).toBe("number");
  });

  it("maps BOOLEAN to boolean", () => {
    expect(typeToTypeScript(prim("BOOLEAN"))).toBe("boolean");
  });

  it("maps DATETIME to string", () => {
    expect(typeToTypeScript(prim("DATETIME"))).toBe("string");
  });

  it("maps RID to string", () => {
    expect(typeToTypeScript(prim("RID"))).toBe("string");
  });

  it("maps BEARERTOKEN to string", () => {
    expect(typeToTypeScript(prim("BEARERTOKEN"))).toBe("string");
  });

  it("maps BINARY to Uint8Array", () => {
    expect(typeToTypeScript(prim("BINARY"))).toBe("Uint8Array");
  });

  it("maps ANY to unknown", () => {
    expect(typeToTypeScript(prim("ANY"))).toBe("unknown");
  });

  it("maps UUID to string", () => {
    expect(typeToTypeScript(prim("UUID"))).toBe("string");
  });

  // Compound types
  it("maps optional<STRING> to string | undefined", () => {
    const type: Type = { type: "optional", optional: { itemType: prim("STRING") } };
    expect(typeToTypeScript(type)).toBe("string | undefined");
  });

  it("maps list<INTEGER> to Array<number>", () => {
    const type: Type = { type: "list", list: { itemType: prim("INTEGER") } };
    expect(typeToTypeScript(type)).toBe("Array<number>");
  });

  it("maps set<STRING> to Set<string>", () => {
    const type: Type = { type: "set", set: { itemType: prim("STRING") } };
    expect(typeToTypeScript(type)).toBe("Set<string>");
  });

  it("maps map<STRING, INTEGER> to Record<string, number>", () => {
    const type: Type = {
      type: "map",
      map: { keyType: prim("STRING"), valueType: prim("INTEGER") },
    };
    expect(typeToTypeScript(type)).toBe("Record<string, number>");
  });

  it("maps map<INTEGER, STRING> to Map<number, string> for non-string keys", () => {
    const type: Type = {
      type: "map",
      map: { keyType: prim("INTEGER"), valueType: prim("STRING") },
    };
    expect(typeToTypeScript(type)).toBe("Map<number, string>");
  });

  it("maps reference to type name", () => {
    expect(typeToTypeScript(ref("MyObject"))).toBe("MyObject");
  });
});

// ---------------------------------------------------------------------------
// Generate Object type
// ---------------------------------------------------------------------------

describe("generateTypeFile — ObjectDefinition", () => {
  it("generates an interface with correct fields", () => {
    const obj: ObjectDefinition = {
      typeName: tn("Resource"),
      fields: [
        { fieldName: "id", type: prim("STRING"), docs: "The resource ID" },
        { fieldName: "count", type: prim("INTEGER") },
        {
          fieldName: "label",
          type: { type: "optional", optional: { itemType: prim("STRING") } },
        },
      ],
      docs: "A resource object",
    };

    const file = generateTypeFile(obj);
    expect(file.path).toBe("resource.ts");
    expect(file.content).toContain("export interface Resource {");
    expect(file.content).toContain("/** The resource ID */");
    expect(file.content).toContain("id: string;");
    expect(file.content).toContain("count: number;");
    // Optional fields use ? syntax
    expect(file.content).toContain("label?: string;");
    expect(file.content).toContain("/** A resource object */");
  });
});

// ---------------------------------------------------------------------------
// Generate Enum type
// ---------------------------------------------------------------------------

describe("generateTypeFile — EnumDefinition", () => {
  it("generates string union and const object", () => {
    const enumDef: EnumDefinition = {
      typeName: tn("Status"),
      values: [
        { value: "ACTIVE", docs: "Currently active" },
        { value: "INACTIVE" },
        { value: "ARCHIVED", deprecated: { docs: "Use INACTIVE instead" } },
      ],
      docs: "Status of a resource",
    };

    const file = generateTypeFile(enumDef);
    expect(file.path).toBe("status.ts");
    expect(file.content).toContain(
      'export type Status = "ACTIVE" | "INACTIVE" | "ARCHIVED";',
    );
    expect(file.content).toContain("export const Status = {");
    expect(file.content).toContain('ACTIVE: "ACTIVE" as const,');
    expect(file.content).toContain("/** Currently active */");
    expect(file.content).toContain("/** @deprecated Use INACTIVE instead */");
  });
});

// ---------------------------------------------------------------------------
// Generate Alias type
// ---------------------------------------------------------------------------

describe("generateTypeFile — AliasDefinition", () => {
  it("generates a type alias", () => {
    const alias: AliasDefinition = {
      typeName: tn("ResourceId"),
      alias: prim("STRING"),
      docs: "Unique resource identifier",
    };

    const file = generateTypeFile(alias);
    expect(file.path).toBe("resource-id.ts");
    expect(file.content).toContain("export type ResourceId = string;");
    expect(file.content).toContain("/** Unique resource identifier */");
  });
});

// ---------------------------------------------------------------------------
// Generate Union type
// ---------------------------------------------------------------------------

describe("generateTypeFile — UnionDefinition", () => {
  it("generates discriminated union with visitor pattern", () => {
    const union: UnionDefinition = {
      typeName: tn("Shape"),
      union: [
        { fieldName: "circle", type: prim("DOUBLE") },
        { fieldName: "square", type: prim("DOUBLE") },
      ],
      docs: "A shape",
    };

    const file = generateTypeFile(union);
    expect(file.path).toBe("shape.ts");
    expect(file.content).toContain("export interface Shape_circle {");
    expect(file.content).toContain('type: "circle";');
    expect(file.content).toContain("circle: number;");
    expect(file.content).toContain("export interface Shape_square {");
    expect(file.content).toContain(
      "export type Shape = Shape_circle | Shape_square;",
    );
    expect(file.content).toContain("export interface ShapeVisitor<T> {");
    expect(file.content).toContain("circle(value: number): T;");
    expect(file.content).toContain("unknown(type: string): T;");
    expect(file.content).toContain(
      "export function visitShape<T>(union: Shape, visitor: ShapeVisitor<T>): T {",
    );
  });
});

// ---------------------------------------------------------------------------
// Generate Service client
// ---------------------------------------------------------------------------

describe("generateServiceFile", () => {
  const baseService: ServiceDefinition = {
    serviceName: tn("ResourceService"),
    endpoints: [],
    docs: "Service for resources",
  };

  it("generates service with GET endpoint (no body)", () => {
    const service: ServiceDefinition = {
      ...baseService,
      endpoints: [
        {
          endpointName: "getResource",
          httpMethod: "GET",
          httpPath: "/resources/{resourceId}",
          args: [
            {
              argName: "resourceId",
              type: prim("STRING"),
              paramType: { type: "path" },
              markers: [],
              tags: [],
            },
          ],
          returns: ref("Resource"),
          tags: [],
          markers: [],
        },
      ],
    };

    const file = generateServiceFile(service, []);
    expect(file.path).toBe("resource-service.ts");
    expect(file.content).toContain("export class ResourceService {");
    expect(file.content).toContain("constructor(client: ConjureClient)");
    expect(file.content).toContain(
      "async getResource(resourceId: string): Promise<Resource>",
    );
    expect(file.content).toContain('"GET"');
    expect(file.content).toContain("${resourceId}");
  });

  it("generates service with POST endpoint (with body)", () => {
    const service: ServiceDefinition = {
      ...baseService,
      endpoints: [
        {
          endpointName: "createResource",
          httpMethod: "POST",
          httpPath: "/resources",
          args: [
            {
              argName: "body",
              type: ref("CreateResourceRequest"),
              paramType: { type: "body" },
              markers: [],
              tags: [],
            },
          ],
          returns: ref("Resource"),
          tags: [],
          markers: [],
        },
      ],
    };

    const file = generateServiceFile(service, []);
    expect(file.content).toContain(
      "async createResource(body: CreateResourceRequest): Promise<Resource>",
    );
    expect(file.content).toContain('"POST"');
    expect(file.content).toContain("body: body");
  });

  it("generates service with path params interpolated", () => {
    const service: ServiceDefinition = {
      ...baseService,
      endpoints: [
        {
          endpointName: "getChild",
          httpMethod: "GET",
          httpPath: "/parents/{parentId}/children/{childId}",
          args: [
            {
              argName: "parentId",
              type: prim("STRING"),
              paramType: { type: "path" },
              markers: [],
              tags: [],
            },
            {
              argName: "childId",
              type: prim("STRING"),
              paramType: { type: "path" },
              markers: [],
              tags: [],
            },
          ],
          returns: ref("Child"),
          tags: [],
          markers: [],
        },
      ],
    };

    const file = generateServiceFile(service, []);
    expect(file.content).toContain("parentId: string, childId: string");
    expect(file.content).toContain("${parentId}");
    expect(file.content).toContain("${childId}");
  });

  it("generates service with query params", () => {
    const service: ServiceDefinition = {
      ...baseService,
      endpoints: [
        {
          endpointName: "listResources",
          httpMethod: "GET",
          httpPath: "/resources",
          args: [
            {
              argName: "pageSize",
              type: prim("INTEGER"),
              paramType: { type: "query", query: { paramId: "pageSize" } },
              markers: [],
              tags: [],
            },
            {
              argName: "pageToken",
              type: prim("STRING"),
              paramType: { type: "query", query: { paramId: "pageToken" } },
              markers: [],
              tags: [],
            },
          ],
          returns: { type: "list", list: { itemType: ref("Resource") } },
          tags: [],
          markers: [],
        },
      ],
    };

    const file = generateServiceFile(service, []);
    expect(file.content).toContain("options?:");
    expect(file.content).toContain("pageSize?: number");
    expect(file.content).toContain("pageToken?: string");
    expect(file.content).toContain("query:");
  });
});

// ---------------------------------------------------------------------------
// Generate Error type
// ---------------------------------------------------------------------------

describe("generateErrorFile", () => {
  it("generates error class with safe and unsafe args", () => {
    const errorDef: ErrorDefinition = {
      errorName: tn("ResourceNotFound"),
      namespace: "Resource",
      code: "NOT_FOUND",
      safeArgs: [
        { fieldName: "resourceId", type: prim("STRING") },
      ],
      unsafeArgs: [
        { fieldName: "requestDetails", type: prim("STRING") },
      ],
      docs: "Resource was not found",
    };

    const file = generateErrorFile(errorDef);
    expect(file.path).toBe("resource-not-found.ts");
    expect(file.content).toContain("export class ResourceNotFound extends Error {");
    expect(file.content).toContain('readonly errorCode = "NOT_FOUND";');
    expect(file.content).toContain('readonly namespace = "Resource";');
    expect(file.content).toContain("export interface ResourceNotFoundSafeArgs {");
    expect(file.content).toContain("resourceId: string;");
    expect(file.content).toContain("export interface ResourceNotFoundUnsafeArgs {");
    expect(file.content).toContain("requestDetails: string;");
    expect(file.content).toContain("/** Resource was not found */");
  });
});

// ---------------------------------------------------------------------------
// Generate index file
// ---------------------------------------------------------------------------

describe("generateIndexFile", () => {
  it("generates barrel export file for all generated files", () => {
    const files: GeneratedFile[] = [
      { path: "resource.ts", content: "" },
      { path: "status.ts", content: "" },
      { path: "resource-service.ts", content: "" },
    ];

    const indexFile = generateIndexFile(files);
    expect(indexFile.path).toBe("index.ts");
    expect(indexFile.content).toContain('export * from "./resource";');
    expect(indexFile.content).toContain('export * from "./status";');
    expect(indexFile.content).toContain('export * from "./resource-service";');
  });
});

// ---------------------------------------------------------------------------
// Full codegen pipeline
// ---------------------------------------------------------------------------

describe("generateFromIr", () => {
  const ir: ConjureDefinition = {
    version: 1,
    types: [
      {
        typeName: tn("Resource"),
        fields: [
          { fieldName: "id", type: prim("STRING") },
          { fieldName: "name", type: prim("STRING") },
        ],
      } as ObjectDefinition,
      {
        typeName: tn("Status"),
        values: [{ value: "ACTIVE" }, { value: "INACTIVE" }],
      } as EnumDefinition,
    ],
    services: [
      {
        serviceName: tn("ResourceService"),
        endpoints: [
          {
            endpointName: "getResource",
            httpMethod: "GET" as const,
            httpPath: "/resources/{id}",
            args: [
              {
                argName: "id",
                type: prim("STRING"),
                paramType: { type: "path" as const },
                markers: [],
                tags: [],
              },
            ],
            returns: { type: "reference" as const, reference: tn("Resource") },
            tags: [],
            markers: [],
          },
        ],
      },
    ],
    errors: [
      {
        errorName: tn("NotFound"),
        namespace: "Test",
        code: "NOT_FOUND" as const,
        safeArgs: [],
        unsafeArgs: [],
      },
    ],
    extensions: {},
  };

  it("generates files for all types, services, errors, and index", () => {
    const files = generateFromIr(ir);

    const paths = files.map((f) => f.path);
    expect(paths).toContain("resource.ts");
    expect(paths).toContain("status.ts");
    expect(paths).toContain("resource-service.ts");
    expect(paths).toContain("not-found.ts");
    expect(paths).toContain("index.ts");
  });

  it("respects generateTypes: false option", () => {
    const files = generateFromIr(ir, { generateTypes: false });
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("resource.ts");
    expect(paths).not.toContain("status.ts");
    expect(paths).toContain("resource-service.ts");
  });

  it("respects generateServices: false option", () => {
    const files = generateFromIr(ir, { generateServices: false });
    const paths = files.map((f) => f.path);
    expect(paths).toContain("resource.ts");
    expect(paths).not.toContain("resource-service.ts");
  });
});

// ---------------------------------------------------------------------------
// Naming utilities
// ---------------------------------------------------------------------------

describe("toKebabCase", () => {
  it("converts PascalCase to kebab-case", () => {
    expect(toKebabCase("OntologyV2")).toBe("ontology-v2");
  });

  it("converts simple PascalCase", () => {
    expect(toKebabCase("MyService")).toBe("my-service");
  });

  it("handles consecutive uppercase", () => {
    expect(toKebabCase("HTMLParser")).toBe("html-parser");
  });

  it("handles single word", () => {
    expect(toKebabCase("Resource")).toBe("resource");
  });
});

describe("toCamelCase", () => {
  it("converts PascalCase to camelCase", () => {
    expect(toCamelCase("GetResource")).toBe("getResource");
  });

  it("handles all-uppercase short strings", () => {
    expect(toCamelCase("ID")).toBe("id");
  });

  it("handles already camelCase", () => {
    expect(toCamelCase("myMethod")).toBe("myMethod");
  });
});

describe("toFileName", () => {
  it("generates kebab-case .ts filename from TypeName", () => {
    expect(toFileName(tn("OntologyV2"))).toBe("ontology-v2.ts");
  });

  it("handles simple name", () => {
    expect(toFileName(tn("Resource"))).toBe("resource.ts");
  });
});

describe("toImportPath", () => {
  it("generates relative import path between sibling files", () => {
    const result = toImportPath("resource.ts", "status.ts");
    expect(result).toBe("./status");
  });
});

// ---------------------------------------------------------------------------
// Generated code validity
// ---------------------------------------------------------------------------

describe("generated code validity", () => {
  it("object type has no syntax errors in basic structure", () => {
    const obj: ObjectDefinition = {
      typeName: tn("TestObj"),
      fields: [
        { fieldName: "name", type: prim("STRING") },
        { fieldName: "value", type: prim("INTEGER") },
      ],
    };
    const file = generateTypeFile(obj);
    // Basic checks: balanced braces
    const opens = (file.content.match(/{/g) || []).length;
    const closes = (file.content.match(/}/g) || []).length;
    expect(opens).toBe(closes);
    // Should contain export keyword
    expect(file.content).toContain("export interface");
  });

  it("enum type produces valid structure", () => {
    const enumDef: EnumDefinition = {
      typeName: tn("Color"),
      values: [{ value: "RED" }, { value: "GREEN" }, { value: "BLUE" }],
    };
    const file = generateTypeFile(enumDef);
    expect(file.content).toContain("export type Color =");
    expect(file.content).toContain("export const Color =");
    const opens = (file.content.match(/{/g) || []).length;
    const closes = (file.content.match(/}/g) || []).length;
    expect(opens).toBe(closes);
  });

  it("service class has balanced braces", () => {
    const service: ServiceDefinition = {
      serviceName: tn("TestService"),
      endpoints: [
        {
          endpointName: "doSomething",
          httpMethod: "POST",
          httpPath: "/do",
          args: [],
          tags: [],
          markers: [],
        },
      ],
    };
    const file = generateServiceFile(service, []);
    const opens = (file.content.match(/{/g) || []).length;
    const closes = (file.content.match(/}/g) || []).length;
    expect(opens).toBe(closes);
  });
});
