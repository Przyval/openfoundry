import { describe, it, expect } from "vitest";
import {
  resolveTypeString,
  parseHttpString,
  extractPathParams,
  compileConjureFile,
  compileConjureFiles,
  mergeDefinitions,
  parseConjureYaml,
} from "../src/index.js";
import type {
  AliasDefinition,
  EnumDefinition,
  ObjectDefinition,
  UnionDefinition,
  ConjureDefinition,
} from "@openfoundry/conjure-ir";

const PKG = "com.example.api";

// ═══════════════════════════════════════════════════════════════════════════
// Type string resolution
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveTypeString", () => {
  it("resolves string primitive", () => {
    expect(resolveTypeString("string", PKG)).toEqual({
      type: "primitive",
      primitive: "STRING",
    });
  });

  it("resolves integer primitive", () => {
    expect(resolveTypeString("integer", PKG)).toEqual({
      type: "primitive",
      primitive: "INTEGER",
    });
  });

  it("resolves double primitive", () => {
    expect(resolveTypeString("double", PKG)).toEqual({
      type: "primitive",
      primitive: "DOUBLE",
    });
  });

  it("resolves boolean primitive", () => {
    expect(resolveTypeString("boolean", PKG)).toEqual({
      type: "primitive",
      primitive: "BOOLEAN",
    });
  });

  it("resolves safelong primitive", () => {
    expect(resolveTypeString("safelong", PKG)).toEqual({
      type: "primitive",
      primitive: "SAFELONG",
    });
  });

  it("resolves datetime primitive", () => {
    expect(resolveTypeString("datetime", PKG)).toEqual({
      type: "primitive",
      primitive: "DATETIME",
    });
  });

  it("resolves rid primitive", () => {
    expect(resolveTypeString("rid", PKG)).toEqual({
      type: "primitive",
      primitive: "RID",
    });
  });

  it("resolves bearertoken primitive", () => {
    expect(resolveTypeString("bearertoken", PKG)).toEqual({
      type: "primitive",
      primitive: "BEARERTOKEN",
    });
  });

  it("resolves binary primitive", () => {
    expect(resolveTypeString("binary", PKG)).toEqual({
      type: "primitive",
      primitive: "BINARY",
    });
  });

  it("resolves any primitive", () => {
    expect(resolveTypeString("any", PKG)).toEqual({
      type: "primitive",
      primitive: "ANY",
    });
  });

  it("resolves uuid primitive", () => {
    expect(resolveTypeString("uuid", PKG)).toEqual({
      type: "primitive",
      primitive: "UUID",
    });
  });

  it("resolves optional<string>", () => {
    expect(resolveTypeString("optional<string>", PKG)).toEqual({
      type: "optional",
      optional: { itemType: { type: "primitive", primitive: "STRING" } },
    });
  });

  it("resolves list<OntologyV2> as reference", () => {
    expect(resolveTypeString("list<OntologyV2>", PKG)).toEqual({
      type: "list",
      list: {
        itemType: { type: "reference", reference: { name: "OntologyV2", package: PKG } },
      },
    });
  });

  it("resolves set<string>", () => {
    expect(resolveTypeString("set<string>", PKG)).toEqual({
      type: "set",
      set: { itemType: { type: "primitive", primitive: "STRING" } },
    });
  });

  it("resolves map<string, PropertyValue>", () => {
    expect(resolveTypeString("map<string, PropertyValue>", PKG)).toEqual({
      type: "map",
      map: {
        keyType: { type: "primitive", primitive: "STRING" },
        valueType: { type: "reference", reference: { name: "PropertyValue", package: PKG } },
      },
    });
  });

  it("resolves named reference", () => {
    expect(resolveTypeString("OntologyV2", PKG)).toEqual({
      type: "reference",
      reference: { name: "OntologyV2", package: PKG },
    });
  });

  it("resolves nested generics: optional<list<string>>", () => {
    expect(resolveTypeString("optional<list<string>>", PKG)).toEqual({
      type: "optional",
      optional: {
        itemType: {
          type: "list",
          list: { itemType: { type: "primitive", primitive: "STRING" } },
        },
      },
    });
  });

  it("resolves deeply nested: map<string, optional<list<integer>>>", () => {
    const result = resolveTypeString("map<string, optional<list<integer>>>", PKG);
    expect(result).toEqual({
      type: "map",
      map: {
        keyType: { type: "primitive", primitive: "STRING" },
        valueType: {
          type: "optional",
          optional: {
            itemType: {
              type: "list",
              list: { itemType: { type: "primitive", primitive: "INTEGER" } },
            },
          },
        },
      },
    });
  });

  it("handles whitespace around type strings", () => {
    expect(resolveTypeString("  string  ", PKG)).toEqual({
      type: "primitive",
      primitive: "STRING",
    });
  });

  it("throws on empty string", () => {
    expect(() => resolveTypeString("", PKG)).toThrow("empty string");
  });

  it("throws on unknown generic wrapper", () => {
    expect(() => resolveTypeString("unknown<string>", PKG)).toThrow("Unknown generic type wrapper");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HTTP string parsing
// ═══════════════════════════════════════════════════════════════════════════

describe("parseHttpString", () => {
  it("parses GET request", () => {
    expect(parseHttpString("GET /ontologies")).toEqual({
      method: "GET",
      path: "/ontologies",
    });
  });

  it("parses POST request", () => {
    expect(parseHttpString("POST /ontologies")).toEqual({
      method: "POST",
      path: "/ontologies",
    });
  });

  it("parses PUT request", () => {
    expect(parseHttpString("PUT /ontologies/{rid}")).toEqual({
      method: "PUT",
      path: "/ontologies/{rid}",
    });
  });

  it("parses DELETE request", () => {
    expect(parseHttpString("DELETE /ontologies/{rid}")).toEqual({
      method: "DELETE",
      path: "/ontologies/{rid}",
    });
  });

  it("parses path with multiple segments and params", () => {
    expect(
      parseHttpString("GET /ontologies/{ontologyRid}/objectTypes/{objectTypeApiName}"),
    ).toEqual({
      method: "GET",
      path: "/ontologies/{ontologyRid}/objectTypes/{objectTypeApiName}",
    });
  });

  it("throws on missing path", () => {
    expect(() => parseHttpString("GET")).toThrow();
  });

  it("throws on invalid method", () => {
    expect(() => parseHttpString("INVALID /path")).toThrow("Invalid HTTP method");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Path param extraction
// ═══════════════════════════════════════════════════════════════════════════

describe("extractPathParams", () => {
  it("extracts single param", () => {
    expect(extractPathParams("/ontologies/{ontologyRid}")).toEqual(["ontologyRid"]);
  });

  it("extracts multiple params", () => {
    expect(
      extractPathParams("/ontologies/{ontologyRid}/objectTypes/{objectTypeApiName}"),
    ).toEqual(["ontologyRid", "objectTypeApiName"]);
  });

  it("returns empty array when no params", () => {
    expect(extractPathParams("/ontologies")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Compile a minimal YAML with one object type
// ═══════════════════════════════════════════════════════════════════════════

describe("compileConjureFile", () => {
  it("compiles a minimal YAML with one object type", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      Foo:
        fields:
          name: string
          count: integer
`;
    const def = compileConjureFile(yaml);
    expect(def.version).toBe(1);
    expect(def.types).toHaveLength(1);

    const obj = def.types[0] as ObjectDefinition;
    expect(obj.typeName).toEqual({ name: "Foo", package: "com.test" });
    expect(obj.fields).toHaveLength(2);
    expect(obj.fields[0].fieldName).toBe("name");
    expect(obj.fields[0].type).toEqual({ type: "primitive", primitive: "STRING" });
    expect(obj.fields[1].fieldName).toBe("count");
    expect(obj.fields[1].type).toEqual({ type: "primitive", primitive: "INTEGER" });
  });

  it("compiles a YAML with enum", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      Direction:
        values:
          - NORTH
          - SOUTH
          - EAST
          - WEST
`;
    const def = compileConjureFile(yaml);
    expect(def.types).toHaveLength(1);
    const enumDef = def.types[0] as EnumDefinition;
    expect(enumDef.typeName.name).toBe("Direction");
    expect(enumDef.values).toHaveLength(4);
    expect(enumDef.values[0].value).toBe("NORTH");
    expect(enumDef.values[3].value).toBe("WEST");
  });

  it("compiles a YAML with alias", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      Rid:
        alias: string
        docs: A resource identifier
`;
    const def = compileConjureFile(yaml);
    expect(def.types).toHaveLength(1);
    const aliasDef = def.types[0] as AliasDefinition;
    expect(aliasDef.typeName.name).toBe("Rid");
    expect(aliasDef.alias).toEqual({ type: "primitive", primitive: "STRING" });
    expect(aliasDef.docs).toBe("A resource identifier");
  });

  it("compiles a YAML with union type", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      Shape:
        union:
          circle: CircleDef
          square: SquareDef
`;
    const def = compileConjureFile(yaml);
    expect(def.types).toHaveLength(1);
    const unionDef = def.types[0] as UnionDefinition;
    expect(unionDef.typeName.name).toBe("Shape");
    expect(unionDef.union).toHaveLength(2);
    expect(unionDef.union[0].fieldName).toBe("circle");
    expect(unionDef.union[0].type).toEqual({
      type: "reference",
      reference: { name: "CircleDef", package: "com.test" },
    });
  });

  it("compiles a service with endpoints", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      Foo:
        fields:
          id: string
services:
  FooService:
    name: Foo Service
    package: com.test
    base-path: /api/v1
    default-auth: header
    endpoints:
      getFoo:
        http: GET /foo/{fooId}
        docs: Get a foo
        args:
          fooId:
            type: string
            param-type: path
        returns: Foo
`;
    const def = compileConjureFile(yaml);
    expect(def.services).toHaveLength(1);
    const svc = def.services[0];
    expect(svc.serviceName.name).toBe("FooService");
    expect(svc.serviceName.package).toBe("com.test");
    expect(svc.endpoints).toHaveLength(1);

    const ep = svc.endpoints[0];
    expect(ep.endpointName).toBe("getFoo");
    expect(ep.httpMethod).toBe("GET");
    expect(ep.httpPath).toBe("/api/v1/foo/{fooId}");
    expect(ep.docs).toBe("Get a foo");
    expect(ep.args).toHaveLength(1);
    expect(ep.args[0].argName).toBe("fooId");
    expect(ep.args[0].paramType).toEqual({ type: "path" });
    expect(ep.returns).toEqual({
      type: "reference",
      reference: { name: "Foo", package: "com.test" },
    });
  });

  it("handles endpoint with body, path, and query params", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      CreateReq:
        fields:
          name: string
      Obj:
        fields:
          id: string
services:
  ObjService:
    name: Obj Service
    package: com.test
    base-path: /api
    default-auth: header
    endpoints:
      createObj:
        http: POST /orgs/{orgId}/objs
        args:
          orgId:
            type: string
            param-type: path
          pageSize:
            type: optional<integer>
            param-type: query
          body:
            type: CreateReq
            param-type: body
        returns: Obj
`;
    const def = compileConjureFile(yaml);
    const ep = def.services[0].endpoints[0];

    expect(ep.args).toHaveLength(3);

    const pathArg = ep.args.find((a) => a.argName === "orgId")!;
    expect(pathArg.paramType).toEqual({ type: "path" });

    const queryArg = ep.args.find((a) => a.argName === "pageSize")!;
    expect(queryArg.paramType).toEqual({ type: "query", query: { paramId: "pageSize" } });

    const bodyArg = ep.args.find((a) => a.argName === "body")!;
    expect(bodyArg.paramType).toEqual({ type: "body" });
  });

  it("handles endpoint without return type", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects: {}
services:
  Svc:
    name: Svc
    package: com.test
    base-path: /api
    default-auth: header
    endpoints:
      deleteObj:
        http: DELETE /objs/{id}
        args:
          id:
            type: string
            param-type: path
`;
    const def = compileConjureFile(yaml);
    const ep = def.services[0].endpoints[0];
    expect(ep.returns).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multi-file compilation
// ═══════════════════════════════════════════════════════════════════════════

describe("compileConjureFiles / mergeDefinitions", () => {
  it("merges types from multiple files", () => {
    const file1 = `
types:
  definitions:
    default-package: com.pkg1
    objects:
      TypeA:
        fields:
          x: string
`;
    const file2 = `
types:
  definitions:
    default-package: com.pkg2
    objects:
      TypeB:
        alias: integer
`;
    const def = compileConjureFiles([
      { filename: "f1.yml", content: file1 },
      { filename: "f2.yml", content: file2 },
    ]);
    expect(def.types).toHaveLength(2);
    expect(def.types.map((t) => t.typeName.name).sort()).toEqual(["TypeA", "TypeB"]);
  });

  it("merges services from multiple files", () => {
    const file1 = `
types:
  definitions:
    default-package: com.a
    objects: {}
services:
  SvcA:
    name: Svc A
    package: com.a
    base-path: /a
    default-auth: header
    endpoints:
      get:
        http: GET /items
        returns: string
`;
    const file2 = `
types:
  definitions:
    default-package: com.b
    objects: {}
services:
  SvcB:
    name: Svc B
    package: com.b
    base-path: /b
    default-auth: header
    endpoints:
      post:
        http: POST /items
        returns: string
`;
    const def = compileConjureFiles([
      { filename: "a.yml", content: file1 },
      { filename: "b.yml", content: file2 },
    ]);
    expect(def.services).toHaveLength(2);
  });

  it("throws on duplicate type definitions across files", () => {
    const file1 = `
types:
  definitions:
    default-package: com.test
    objects:
      Dupe:
        alias: string
`;
    const file2 = `
types:
  definitions:
    default-package: com.test
    objects:
      Dupe:
        alias: integer
`;
    expect(() =>
      compileConjureFiles([
        { filename: "f1.yml", content: file1 },
        { filename: "f2.yml", content: file2 },
      ]),
    ).toThrow("Duplicate type definition");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Full compilation of common-types.yml (inline fixture)
// ═══════════════════════════════════════════════════════════════════════════

describe("full compilation: common-types.yml", () => {
  const commonTypesYaml = `
types:
  definitions:
    default-package: com.openfoundry.api
    objects:
      Rid:
        alias: string
        docs: Resource identifier in format ri.<service>.<instance>.<type>.<locator>

      PageToken:
        alias: string
        docs: Opaque cursor for pagination

      PageRequest:
        fields:
          pageSize: optional<integer>
          pageToken: optional<PageToken>

      DisplayName:
        alias: string

      Description:
        alias: string

      Timestamp:
        alias: datetime

      PropertyValue:
        alias: any
        docs: Dynamic property value (string, integer, double, boolean, datetime, etc.)

      PropertyMap:
        alias: map<string, PropertyValue>
        docs: Map of property API names to their values

      OrderByClause:
        fields:
          field: string
          direction:
            type: optional<OrderDirection>
            docs: Sort direction, defaults to asc

      OrderDirection:
        values:
          - ASC
          - DESC

      ErrorResponse:
        fields:
          errorCode: string
          errorName: string
          errorInstanceId: string
          parameters: optional<map<string, any>>
          statusCode: integer
`;

  it("produces correct number of type definitions", () => {
    const def = compileConjureFile(commonTypesYaml, "common-types.yml");
    // Rid, PageToken, PageRequest, DisplayName, Description, Timestamp,
    // PropertyValue, PropertyMap, OrderByClause, OrderDirection, ErrorResponse
    expect(def.types).toHaveLength(11);
  });

  it("Rid is an alias to string", () => {
    const def = compileConjureFile(commonTypesYaml);
    const rid = def.types.find((t) => t.typeName.name === "Rid") as AliasDefinition;
    expect(rid.alias).toEqual({ type: "primitive", primitive: "STRING" });
    expect(rid.docs).toBe("Resource identifier in format ri.<service>.<instance>.<type>.<locator>");
  });

  it("OrderDirection is an enum with ASC and DESC", () => {
    const def = compileConjureFile(commonTypesYaml);
    const od = def.types.find((t) => t.typeName.name === "OrderDirection") as EnumDefinition;
    expect(od.values).toEqual([{ value: "ASC" }, { value: "DESC" }]);
  });

  it("PageRequest is an object with optional fields", () => {
    const def = compileConjureFile(commonTypesYaml);
    const pr = def.types.find((t) => t.typeName.name === "PageRequest") as ObjectDefinition;
    expect(pr.fields).toHaveLength(2);
    expect(pr.fields[0].fieldName).toBe("pageSize");
    expect(pr.fields[0].type).toEqual({
      type: "optional",
      optional: { itemType: { type: "primitive", primitive: "INTEGER" } },
    });
  });

  it("PropertyMap alias resolves map<string, PropertyValue>", () => {
    const def = compileConjureFile(commonTypesYaml);
    const pm = def.types.find((t) => t.typeName.name === "PropertyMap") as AliasDefinition;
    expect(pm.alias).toEqual({
      type: "map",
      map: {
        keyType: { type: "primitive", primitive: "STRING" },
        valueType: {
          type: "reference",
          reference: { name: "PropertyValue", package: "com.openfoundry.api" },
        },
      },
    });
  });

  it("ErrorResponse has 5 fields with correct types", () => {
    const def = compileConjureFile(commonTypesYaml);
    const er = def.types.find((t) => t.typeName.name === "ErrorResponse") as ObjectDefinition;
    expect(er.fields).toHaveLength(5);
    const params = er.fields.find((f) => f.fieldName === "parameters")!;
    expect(params.type).toEqual({
      type: "optional",
      optional: {
        itemType: {
          type: "map",
          map: {
            keyType: { type: "primitive", primitive: "STRING" },
            valueType: { type: "primitive", primitive: "ANY" },
          },
        },
      },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Full compilation of ontology-service.yml (key parts)
// ═══════════════════════════════════════════════════════════════════════════

describe("full compilation: ontology-service.yml (key parts)", () => {
  const ontologySvcYaml = `
types:
  definitions:
    default-package: com.openfoundry.api.ontology
    objects:
      OntologyV2:
        fields:
          rid: Rid
          apiName: string
          displayName: string
          description: string
          version: string

      ListOntologiesResponse:
        fields:
          data: list<OntologyV2>
          nextPageToken: optional<PageToken>

      Rid:
        alias: string

      PageToken:
        alias: string

services:
  OntologyService:
    name: Ontology Service
    package: com.openfoundry.api.ontology
    base-path: /api/v2
    default-auth: header
    endpoints:
      listOntologies:
        http: GET /ontologies
        docs: List all ontologies with pagination
        args:
          pageSize:
            type: optional<integer>
            param-type: query
          pageToken:
            type: optional<PageToken>
            param-type: query
        returns: ListOntologiesResponse

      getOntology:
        http: GET /ontologies/{ontologyRid}
        docs: Get an ontology by its RID
        args:
          ontologyRid:
            type: Rid
            param-type: path
        returns: OntologyV2

      deleteOntology:
        http: DELETE /ontologies/{ontologyRid}
        docs: Delete an ontology by its RID
        args:
          ontologyRid:
            type: Rid
            param-type: path
`;

  it("compiles services correctly", () => {
    const def = compileConjureFile(ontologySvcYaml, "ontology-service.yml");
    expect(def.services).toHaveLength(1);
    const svc = def.services[0];
    expect(svc.serviceName.name).toBe("OntologyService");
    expect(svc.endpoints).toHaveLength(3);
  });

  it("listOntologies endpoint has query params", () => {
    const def = compileConjureFile(ontologySvcYaml);
    const ep = def.services[0].endpoints.find((e) => e.endpointName === "listOntologies")!;
    expect(ep.httpMethod).toBe("GET");
    expect(ep.httpPath).toBe("/api/v2/ontologies");
    expect(ep.args).toHaveLength(2);
    expect(ep.args[0].paramType).toEqual({ type: "query", query: { paramId: "pageSize" } });
  });

  it("getOntology endpoint has path param", () => {
    const def = compileConjureFile(ontologySvcYaml);
    const ep = def.services[0].endpoints.find((e) => e.endpointName === "getOntology")!;
    expect(ep.httpMethod).toBe("GET");
    expect(ep.httpPath).toBe("/api/v2/ontologies/{ontologyRid}");
    expect(ep.args).toHaveLength(1);
    expect(ep.args[0].argName).toBe("ontologyRid");
    expect(ep.args[0].paramType).toEqual({ type: "path" });
  });

  it("deleteOntology has no return type", () => {
    const def = compileConjureFile(ontologySvcYaml);
    const ep = def.services[0].endpoints.find((e) => e.endpointName === "deleteOntology")!;
    expect(ep.httpMethod).toBe("DELETE");
    expect(ep.returns).toBeUndefined();
  });

  it("OntologyV2 object has reference fields", () => {
    const def = compileConjureFile(ontologySvcYaml);
    const ont = def.types.find((t) => t.typeName.name === "OntologyV2") as ObjectDefinition;
    expect(ont.fields).toHaveLength(5);
    const ridField = ont.fields.find((f) => f.fieldName === "rid")!;
    expect(ridField.type).toEqual({
      type: "reference",
      reference: { name: "Rid", package: "com.openfoundry.api.ontology" },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// YAML parser
// ═══════════════════════════════════════════════════════════════════════════

describe("parseConjureYaml", () => {
  it("parses valid YAML into RawConjureFile", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      Foo:
        alias: string
`;
    const raw = parseConjureYaml(yaml);
    expect(raw.types?.definitions["default-package"]).toBe("com.test");
    expect(raw.types?.definitions.objects.Foo.alias).toBe("string");
  });

  it("parses YAML with services", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects: {}
services:
  MySvc:
    name: My Service
    package: com.test
    base-path: /api
    default-auth: header
    endpoints:
      doSomething:
        http: POST /stuff
        returns: string
`;
    const raw = parseConjureYaml(yaml);
    expect(raw.services).toBeDefined();
    expect(raw.services!.MySvc.name).toBe("My Service");
    expect(raw.services!.MySvc.endpoints.doSomething.http).toBe("POST /stuff");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases / error handling
// ═══════════════════════════════════════════════════════════════════════════

describe("error handling", () => {
  it("throws on type def with no recognized keys", () => {
    const yaml = `
types:
  definitions:
    default-package: com.test
    objects:
      Bad:
        somethingUnknown: true
`;
    expect(() => compileConjureFile(yaml)).toThrow("Cannot determine type kind");
  });

  it("resolveTypeString throws on unclosed generic", () => {
    expect(() => resolveTypeString("optional<string", PKG)).toThrow("unclosed generic");
  });

  it("resolveTypeString handles map with nested generics as value", () => {
    const result = resolveTypeString("map<string, list<integer>>", PKG);
    expect(result).toEqual({
      type: "map",
      map: {
        keyType: { type: "primitive", primitive: "STRING" },
        valueType: {
          type: "list",
          list: { itemType: { type: "primitive", primitive: "INTEGER" } },
        },
      },
    });
  });
});
