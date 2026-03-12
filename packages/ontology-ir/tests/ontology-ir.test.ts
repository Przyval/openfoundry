import { describe, it, expect } from "vitest";
import type {
  OntologyIr,
  ObjectTypeIr,
  ActionTypeIr,
  LinkTypeIr,
  InterfaceTypeIr,
  QueryTypeIr,
} from "../src/ontology-ir.js";
import { ontologyToIr, irToOntology } from "../src/ir-converter.js";
import {
  serializeOntologyIr,
  deserializeOntologyIr,
  validateOntologyIr,
} from "../src/ir-serializer.js";
import type { OntologyDefinition } from "@openfoundry/ontology-schema";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function createTestOntologyDefinition(): OntologyDefinition {
  return {
    rid: "ri.ontology.main.ontology.test-ontology",
    apiName: "test-ontology",
    displayName: "Test Ontology",
    description: "A test ontology for unit tests",
    objectTypes: {
      Employee: {
        apiName: "Employee",
        description: "An employee record",
        primaryKeyApiName: "employeeId",
        primaryKeyType: "STRING",
        titlePropertyApiName: "fullName",
        properties: {
          employeeId: {
            type: "STRING",
            nullable: false,
            multiplicity: "SINGLE",
            description: "Unique employee identifier",
          },
          fullName: {
            type: "STRING",
            nullable: false,
            multiplicity: "SINGLE",
            description: "Full name",
          },
          age: {
            type: "INTEGER",
            nullable: true,
            multiplicity: "SINGLE",
          },
          tags: {
            type: "STRING",
            nullable: false,
            multiplicity: "ARRAY",
            description: "Tags",
          },
        },
        implements: ["Identifiable"],
        status: "ACTIVE",
      },
      Department: {
        apiName: "Department",
        description: "A department",
        primaryKeyApiName: "departmentId",
        primaryKeyType: "STRING",
        titlePropertyApiName: "name",
        properties: {
          departmentId: {
            type: "STRING",
            nullable: false,
            multiplicity: "SINGLE",
          },
          name: {
            type: "STRING",
            nullable: false,
            multiplicity: "SINGLE",
          },
        },
        implements: [],
        status: "ACTIVE",
      },
    },
    actionTypes: {
      createEmployee: {
        apiName: "createEmployee",
        description: "Creates a new employee",
        parameters: {
          fullName: { type: "STRING", required: true, description: "Name" },
          age: { type: "INTEGER", required: false },
        },
        modifiedEntities: {
          Employee: { created: true, modified: false },
        },
        status: "ACTIVE",
      },
    },
    linkTypes: {
      employeeDepartment: {
        apiName: "employeeDepartment",
        objectTypeApiName: "Employee",
        linkedObjectTypeApiName: "Department",
        cardinality: "MANY",
        foreignKeyPropertyApiName: "departmentId",
      },
    },
    interfaceTypes: {
      Identifiable: {
        apiName: "Identifiable",
        description: "Has an ID property",
        properties: {
          id: {
            type: "STRING",
            nullable: false,
            multiplicity: "SINGLE",
          },
        },
        extendsInterfaces: [],
      },
    },
    queryTypes: {
      getEmployeesByDepartment: {
        apiName: "getEmployeesByDepartment",
        version: "1.0",
        description: "Get employees in a department",
        parameters: {
          departmentId: { type: "STRING", required: true },
        },
        output: {
          type: "OBJECT_SET",
          objectTypeApiName: "Employee",
        },
      },
    },
  };
}

function createTestIr(): OntologyIr {
  return {
    apiName: "test-ontology",
    version: "1.0.0",
    objectTypes: {
      Employee: {
        apiName: "Employee",
        primaryKey: "employeeId",
        properties: {
          employeeId: {
            apiName: "employeeId",
            type: "STRING",
            nullable: false,
            array: false,
            description: "Unique employee identifier",
          },
          fullName: {
            apiName: "fullName",
            type: "STRING",
            nullable: false,
            array: false,
          },
          age: {
            apiName: "age",
            type: "INTEGER",
            nullable: true,
            array: false,
          },
        },
        implements: ["Identifiable"],
        titleProperty: "fullName",
        status: "ACTIVE",
      },
    },
    actionTypes: {
      createEmployee: {
        apiName: "createEmployee",
        parameters: {
          fullName: { type: "STRING", required: true, description: "Name" },
          age: { type: "INTEGER", required: false },
        },
        modifiedEntities: [
          { objectType: "Employee", modification: "CREATED" },
        ],
      },
    },
    linkTypes: {
      employeeDepartment: {
        apiName: "employeeDepartment",
        objectTypeA: "Employee",
        objectTypeB: "Department",
        cardinality: "MANY",
      },
    },
    interfaceTypes: {
      Identifiable: {
        apiName: "Identifiable",
        properties: {
          id: {
            apiName: "id",
            type: "STRING",
            nullable: false,
            array: false,
          },
        },
        extendsInterfaces: [],
      },
    },
    queryTypes: {
      getEmployeesByDepartment: {
        apiName: "getEmployeesByDepartment",
        version: "1.0",
        parameters: {
          departmentId: { type: "STRING", required: true },
        },
        output: { objectType: "Employee" },
      },
    },
    metadata: {
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      description: "A test ontology for unit tests",
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ontologyToIr", () => {
  it("converts an OntologyDefinition to OntologyIr", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);

    expect(ir.apiName).toBe("test-ontology");
    expect(ir.version).toBe("1.0.0");
    expect(Object.keys(ir.objectTypes)).toContain("Employee");
    expect(Object.keys(ir.actionTypes)).toContain("createEmployee");
    expect(Object.keys(ir.linkTypes)).toContain("employeeDepartment");
    expect(Object.keys(ir.interfaceTypes)).toContain("Identifiable");
    expect(Object.keys(ir.queryTypes)).toContain("getEmployeesByDepartment");
  });

  it("converts object type properties correctly", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);
    const emp = ir.objectTypes["Employee"];

    expect(emp.primaryKey).toBe("employeeId");
    expect(emp.titleProperty).toBe("fullName");
    expect(emp.status).toBe("ACTIVE");
    expect(emp.implements).toEqual(["Identifiable"]);
    expect(emp.properties["employeeId"].type).toBe("STRING");
    expect(emp.properties["employeeId"].nullable).toBe(false);
    expect(emp.properties["age"].nullable).toBe(true);
  });

  it("converts array multiplicity to array: true", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);
    const emp = ir.objectTypes["Employee"];

    expect(emp.properties["tags"].array).toBe(true);
    expect(emp.properties["employeeId"].array).toBe(false);
  });

  it("converts action types with parameters and modified entities", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);
    const action = ir.actionTypes["createEmployee"];

    expect(action.parameters["fullName"].type).toBe("STRING");
    expect(action.parameters["fullName"].required).toBe(true);
    expect(action.parameters["age"].required).toBe(false);
    expect(action.modifiedEntities).toEqual([
      { objectType: "Employee", modification: "CREATED" },
    ]);
  });

  it("converts link types", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);
    const link = ir.linkTypes["employeeDepartment"];

    expect(link.objectTypeA).toBe("Employee");
    expect(link.objectTypeB).toBe("Department");
    expect(link.cardinality).toBe("MANY");
  });

  it("converts interface types", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);
    const iface = ir.interfaceTypes["Identifiable"];

    expect(iface.properties["id"].type).toBe("STRING");
    expect(iface.extendsInterfaces).toEqual([]);
  });

  it("converts query types with object set output", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);
    const query = ir.queryTypes["getEmployeesByDepartment"];

    expect(query.version).toBe("1.0");
    expect(query.parameters["departmentId"].type).toBe("STRING");
    expect(query.output).toEqual({ objectType: "Employee" });
  });

  it("populates metadata", () => {
    const def = createTestOntologyDefinition();
    const ir = ontologyToIr(def);

    expect(ir.metadata.description).toBe("A test ontology for unit tests");
    expect(ir.metadata.createdAt).toBeTruthy();
    expect(ir.metadata.updatedAt).toBeTruthy();
  });
});

describe("irToOntology", () => {
  it("converts an OntologyIr back to an OntologyDefinition", () => {
    const ir = createTestIr();
    const def = irToOntology(ir);

    expect(def.apiName).toBe("test-ontology");
    expect(def.rid).toContain("test-ontology");
    expect(Object.keys(def.objectTypes)).toContain("Employee");
    expect(Object.keys(def.actionTypes)).toContain("createEmployee");
  });

  it("roundtrips object types preserving key fields", () => {
    const original = createTestOntologyDefinition();
    const ir = ontologyToIr(original);
    const restored = irToOntology(ir);

    expect(restored.objectTypes["Employee"].primaryKeyApiName).toBe("employeeId");
    expect(restored.objectTypes["Employee"].properties["employeeId"].type).toBe("STRING");
    expect(restored.objectTypes["Employee"].implements).toEqual(["Identifiable"]);
  });
});

describe("serializeOntologyIr / deserializeOntologyIr", () => {
  it("serializes to JSON with 2-space indent", () => {
    const ir = createTestIr();
    const json = serializeOntologyIr(ir);
    expect(json).toContain('"apiName": "test-ontology"');
    expect(json.startsWith("{")).toBe(true);
    // Verify 2-space indent
    expect(json).toContain("\n  ");
  });

  it("deserializes valid JSON to OntologyIr", () => {
    const ir = createTestIr();
    const json = serializeOntologyIr(ir);
    const restored = deserializeOntologyIr(json);

    expect(restored.apiName).toBe(ir.apiName);
    expect(restored.version).toBe(ir.version);
    expect(Object.keys(restored.objectTypes)).toEqual(Object.keys(ir.objectTypes));
  });

  it("throws on invalid JSON", () => {
    expect(() => deserializeOntologyIr("not json")).toThrow("Invalid JSON");
  });

  it("throws on structurally invalid data", () => {
    expect(() => deserializeOntologyIr('{"apiName": 123}')).toThrow(
      "Invalid OntologyIr",
    );
  });
});

describe("validateOntologyIr", () => {
  it("returns true for a valid OntologyIr", () => {
    const ir = createTestIr();
    expect(validateOntologyIr(ir)).toBe(true);
  });

  it("returns false for null", () => {
    expect(validateOntologyIr(null)).toBe(false);
  });

  it("returns false for a plain object missing required fields", () => {
    expect(validateOntologyIr({ apiName: "test" })).toBe(false);
  });

  it("returns false when objectTypes contains invalid entries", () => {
    const ir = createTestIr();
    const bad = { ...ir, objectTypes: { bad: { apiName: 123 } } };
    expect(validateOntologyIr(bad)).toBe(false);
  });

  it("returns false when property type is invalid", () => {
    const ir = createTestIr();
    const bad = JSON.parse(JSON.stringify(ir));
    bad.objectTypes.Employee.properties.employeeId.type = "INVALID_TYPE";
    expect(validateOntologyIr(bad)).toBe(false);
  });
});
