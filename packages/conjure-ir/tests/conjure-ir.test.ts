import { describe, expect, it } from "vitest";
import {
  bodyArg,
  createAliasDef,
  createEndpoint,
  createEnumDef,
  createObjectDef,
  getAllEndpoints,
  getAllTypeNames,
  getTypeDefinition,
  headerArg,
  isAliasDefinition,
  isEnumDefinition,
  isObjectDefinition,
  isUnionDefinition,
  listType,
  mapType,
  optionalType,
  pathArg,
  primitiveType,
  queryArg,
  referenceType,
  resolveType,
  setType,
  typeName,
  validateIr,
} from "../src/index.js";
import type {
  ConjureDefinition,
  FieldDefinition,
  UnionDefinition,
} from "../src/index.js";

const PKG = "com.example.api";

function emptyIr(overrides?: Partial<ConjureDefinition>): ConjureDefinition {
  return {
    version: 1,
    errors: [],
    types: [],
    services: [],
    extensions: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Builder: Type constructors
// ---------------------------------------------------------------------------
describe("type constructors", () => {
  it("primitiveType creates a primitive type", () => {
    const t = primitiveType("STRING");
    expect(t).toEqual({ type: "primitive", primitive: "STRING" });
  });

  it("optionalType wraps an item type", () => {
    const t = optionalType(primitiveType("INTEGER"));
    expect(t).toEqual({
      type: "optional",
      optional: { itemType: { type: "primitive", primitive: "INTEGER" } },
    });
  });

  it("listType wraps an item type", () => {
    const t = listType(primitiveType("BOOLEAN"));
    expect(t).toEqual({
      type: "list",
      list: { itemType: { type: "primitive", primitive: "BOOLEAN" } },
    });
  });

  it("setType wraps an item type", () => {
    const t = setType(primitiveType("UUID"));
    expect(t).toEqual({
      type: "set",
      set: { itemType: { type: "primitive", primitive: "UUID" } },
    });
  });

  it("mapType creates a map with key and value types", () => {
    const t = mapType(primitiveType("STRING"), primitiveType("ANY"));
    expect(t).toEqual({
      type: "map",
      map: {
        keyType: { type: "primitive", primitive: "STRING" },
        valueType: { type: "primitive", primitive: "ANY" },
      },
    });
  });

  it("referenceType creates a named type reference", () => {
    const t = referenceType("MyObject", PKG);
    expect(t).toEqual({
      type: "reference",
      reference: { name: "MyObject", package: PKG },
    });
  });
});

// ---------------------------------------------------------------------------
// Builder: typeName
// ---------------------------------------------------------------------------
describe("typeName", () => {
  it("creates a TypeName with name and package", () => {
    const tn = typeName("Foo", PKG);
    expect(tn).toEqual({ name: "Foo", package: PKG });
  });
});

// ---------------------------------------------------------------------------
// Builder: Definition creators
// ---------------------------------------------------------------------------
describe("definition builders", () => {
  it("createObjectDef creates an object definition", () => {
    const fields: FieldDefinition[] = [
      { fieldName: "id", type: primitiveType("STRING") },
      { fieldName: "count", type: primitiveType("INTEGER") },
    ];
    const obj = createObjectDef("Widget", PKG, fields, "A widget.");
    expect(obj.typeName).toEqual({ name: "Widget", package: PKG });
    expect(obj.fields).toHaveLength(2);
    expect(obj.docs).toBe("A widget.");
  });

  it("createObjectDef omits docs when not provided", () => {
    const obj = createObjectDef("Thing", PKG, []);
    expect(obj).not.toHaveProperty("docs");
  });

  it("createEnumDef creates an enum definition from strings", () => {
    const e = createEnumDef("Color", PKG, ["RED", "GREEN", "BLUE"]);
    expect(e.typeName.name).toBe("Color");
    expect(e.values).toEqual([
      { value: "RED" },
      { value: "GREEN" },
      { value: "BLUE" },
    ]);
  });

  it("createAliasDef creates an alias definition", () => {
    const a = createAliasDef("UserId", PKG, primitiveType("STRING"), "User identifier");
    expect(a.typeName.name).toBe("UserId");
    expect(a.alias).toEqual({ type: "primitive", primitive: "STRING" });
    expect(a.docs).toBe("User identifier");
  });
});

// ---------------------------------------------------------------------------
// Builder: Endpoint and args
// ---------------------------------------------------------------------------
describe("endpoint builders", () => {
  it("createEndpoint creates a basic endpoint", () => {
    const ep = createEndpoint("getWidget", "GET", "/widgets/{widgetId}");
    expect(ep.endpointName).toBe("getWidget");
    expect(ep.httpMethod).toBe("GET");
    expect(ep.httpPath).toBe("/widgets/{widgetId}");
    expect(ep.args).toEqual([]);
    expect(ep.tags).toEqual([]);
    expect(ep.markers).toEqual([]);
  });

  it("createEndpoint with args and returns", () => {
    const ep = createEndpoint("createWidget", "POST", "/widgets", {
      args: [bodyArg("body", referenceType("Widget", PKG))],
      returns: referenceType("Widget", PKG),
      docs: "Create a new widget",
      auth: { type: "header" },
    });
    expect(ep.args).toHaveLength(1);
    expect(ep.returns).toEqual({ type: "reference", reference: { name: "Widget", package: PKG } });
    expect(ep.docs).toBe("Create a new widget");
    expect(ep.auth).toEqual({ type: "header" });
  });

  it("bodyArg creates a body argument", () => {
    const arg = bodyArg("data", primitiveType("BINARY"));
    expect(arg.paramType).toEqual({ type: "body" });
    expect(arg.argName).toBe("data");
  });

  it("pathArg creates a path argument", () => {
    const arg = pathArg("widgetId", primitiveType("STRING"));
    expect(arg.paramType).toEqual({ type: "path" });
  });

  it("queryArg creates a query argument", () => {
    const arg = queryArg("filter", "filter", primitiveType("STRING"));
    expect(arg.paramType).toEqual({ type: "query", query: { paramId: "filter" } });
  });

  it("headerArg creates a header argument", () => {
    const arg = headerArg("traceId", "X-Trace-Id", primitiveType("STRING"));
    expect(arg.paramType).toEqual({ type: "header", header: { paramId: "X-Trace-Id" } });
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
describe("validateIr", () => {
  it("validates a well-formed IR", () => {
    const ir = emptyIr({
      types: [
        createObjectDef("Widget", PKG, [
          { fieldName: "name", type: primitiveType("STRING") },
        ]),
      ],
      services: [
        {
          serviceName: typeName("WidgetService", PKG),
          endpoints: [
            createEndpoint("getWidget", "GET", "/widgets/{widgetId}", {
              args: [pathArg("widgetId", primitiveType("STRING"))],
              returns: referenceType("Widget", PKG),
            }),
          ],
        },
      ],
    });
    const result = validateIr(ir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects unresolved type references", () => {
    const ir = emptyIr({
      services: [
        {
          serviceName: typeName("Svc", PKG),
          endpoints: [
            createEndpoint("get", "GET", "/foo", {
              returns: referenceType("NonExistent", PKG),
            }),
          ],
        },
      ],
    });
    const result = validateIr(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("NonExistent"))).toBe(true);
  });

  it("detects duplicate type names", () => {
    const ir = emptyIr({
      types: [
        createObjectDef("Dupe", PKG, []),
        createEnumDef("Dupe", PKG, ["A"]),
      ],
    });
    const result = validateIr(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate type name"))).toBe(true);
  });

  it("detects missing path arguments", () => {
    const ir = emptyIr({
      services: [
        {
          serviceName: typeName("Svc", PKG),
          endpoints: [
            createEndpoint("get", "GET", "/items/{itemId}"),
          ],
        },
      ],
    });
    const result = validateIr(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("itemId"))).toBe(true);
  });

  it("detects path args with no matching path parameter", () => {
    const ir = emptyIr({
      services: [
        {
          serviceName: typeName("Svc", PKG),
          endpoints: [
            createEndpoint("get", "GET", "/items", {
              args: [pathArg("orphan", primitiveType("STRING"))],
            }),
          ],
        },
      ],
    });
    const result = validateIr(ir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("orphan"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
describe("utility functions", () => {
  const widgetObj = createObjectDef("Widget", PKG, [
    { fieldName: "name", type: primitiveType("STRING") },
  ]);
  const colorEnum = createEnumDef("Color", PKG, ["RED", "GREEN"]);
  const userIdAlias = createAliasDef("UserId", PKG, primitiveType("STRING"));

  const unionDef: UnionDefinition = {
    typeName: typeName("Shape", PKG),
    union: [
      { fieldName: "circle", type: primitiveType("DOUBLE") },
      { fieldName: "square", type: primitiveType("DOUBLE") },
    ],
  };

  const ir = emptyIr({
    types: [widgetObj, colorEnum, userIdAlias, unionDef],
    services: [
      {
        serviceName: typeName("WidgetService", PKG),
        endpoints: [
          createEndpoint("list", "GET", "/widgets"),
          createEndpoint("create", "POST", "/widgets"),
        ],
      },
      {
        serviceName: typeName("ColorService", PKG),
        endpoints: [
          createEndpoint("getColor", "GET", "/colors/{id}", {
            args: [pathArg("id", primitiveType("STRING"))],
          }),
        ],
      },
    ],
  });

  it("getTypeDefinition finds a type by name", () => {
    const td = getTypeDefinition(ir, typeName("Widget", PKG));
    expect(td).toBeDefined();
    expect(td!.typeName.name).toBe("Widget");
  });

  it("getTypeDefinition returns undefined for unknown type", () => {
    expect(getTypeDefinition(ir, typeName("Unknown", PKG))).toBeUndefined();
  });

  it("getAllTypeNames returns all type names", () => {
    const names = getAllTypeNames(ir);
    expect(names).toHaveLength(4);
    expect(names.map((n) => n.name).sort()).toEqual(["Color", "Shape", "UserId", "Widget"]);
  });

  it("getAllEndpoints returns endpoints across all services", () => {
    const endpoints = getAllEndpoints(ir);
    expect(endpoints).toHaveLength(3);
    expect(endpoints.map((e) => e.endpointName).sort()).toEqual(["create", "getColor", "list"]);
  });

  it("resolveType resolves a primitive", () => {
    const resolved = resolveType(ir, primitiveType("STRING"));
    expect(resolved).toBe("STRING");
  });

  it("resolveType resolves a reference", () => {
    const resolved = resolveType(ir, referenceType("Widget", PKG));
    expect(resolved).toBeDefined();
    expect((resolved as { typeName: { name: string } }).typeName.name).toBe("Widget");
  });

  it("resolveType returns undefined for container types", () => {
    expect(resolveType(ir, listType(primitiveType("STRING")))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
describe("type guards", () => {
  const obj = createObjectDef("Obj", PKG, []);
  const en = createEnumDef("Enum", PKG, ["A"]);
  const alias = createAliasDef("Alias", PKG, primitiveType("STRING"));
  const union: UnionDefinition = {
    typeName: typeName("Union", PKG),
    union: [{ fieldName: "a", type: primitiveType("STRING") }],
  };

  it("isObjectDefinition correctly identifies objects", () => {
    expect(isObjectDefinition(obj)).toBe(true);
    expect(isObjectDefinition(en)).toBe(false);
    expect(isObjectDefinition(alias)).toBe(false);
    expect(isObjectDefinition(union)).toBe(false);
  });

  it("isEnumDefinition correctly identifies enums", () => {
    expect(isEnumDefinition(en)).toBe(true);
    expect(isEnumDefinition(obj)).toBe(false);
  });

  it("isAliasDefinition correctly identifies aliases", () => {
    expect(isAliasDefinition(alias)).toBe(true);
    expect(isAliasDefinition(obj)).toBe(false);
  });

  it("isUnionDefinition correctly identifies unions", () => {
    expect(isUnionDefinition(union)).toBe(true);
    expect(isUnionDefinition(obj)).toBe(false);
  });
});
