import { describe, it, expect } from "vitest";
import { generateObjectInterface, mapPropertyTypeToTs } from "../src/object-generator.js";
import { generateActionTypes, getParamsInterfaceName } from "../src/action-generator.js";
import { generateTypedClient } from "../src/client-generator.js";
import { generateFromOntologyIr } from "../src/generator.js";
import type {
  OntologyIr,
  ObjectTypeIr,
  ActionTypeIr,
} from "@openfoundry/ontology-ir";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createEmployeeObjectType(): ObjectTypeIr {
  return {
    apiName: "Employee",
    primaryKey: "employeeId",
    properties: {
      employeeId: {
        apiName: "employeeId",
        type: "STRING",
        nullable: false,
        array: false,
        description: "Unique identifier",
      },
      firstName: {
        apiName: "firstName",
        type: "STRING",
        nullable: false,
        array: false,
      },
      lastName: {
        apiName: "lastName",
        type: "STRING",
        nullable: false,
        array: false,
      },
      email: {
        apiName: "email",
        type: "STRING",
        nullable: false,
        array: false,
      },
      startDate: {
        apiName: "startDate",
        type: "TIMESTAMP",
        nullable: true,
        array: false,
      },
      age: {
        apiName: "age",
        type: "INTEGER",
        nullable: false,
        array: false,
      },
      tags: {
        apiName: "tags",
        type: "STRING",
        nullable: false,
        array: true,
      },
      isActive: {
        apiName: "isActive",
        type: "BOOLEAN",
        nullable: false,
        array: false,
      },
      score: {
        apiName: "score",
        type: "DOUBLE",
        nullable: false,
        array: false,
      },
    },
    implements: [],
    titleProperty: "firstName",
    status: "ACTIVE",
  };
}

function createActionType(): ActionTypeIr {
  return {
    apiName: "createEmployee",
    parameters: {
      firstName: { type: "STRING", required: true, description: "First name" },
      lastName: { type: "STRING", required: true },
      email: { type: "STRING", required: true },
      startDate: { type: "TIMESTAMP", required: false },
    },
    modifiedEntities: [
      { objectType: "Employee", modification: "CREATED" },
    ],
  };
}

function createTestIr(): OntologyIr {
  return {
    apiName: "test-ontology",
    version: "1.0.0",
    objectTypes: {
      Employee: createEmployeeObjectType(),
      Department: {
        apiName: "Department",
        primaryKey: "departmentId",
        properties: {
          departmentId: {
            apiName: "departmentId",
            type: "STRING",
            nullable: false,
            array: false,
          },
          name: {
            apiName: "name",
            type: "STRING",
            nullable: false,
            array: false,
          },
        },
        implements: [],
        titleProperty: "name",
        status: "ACTIVE",
      },
    },
    actionTypes: {
      createEmployee: createActionType(),
    },
    linkTypes: {},
    interfaceTypes: {},
    queryTypes: {},
    metadata: {
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
  };
}

// ---------------------------------------------------------------------------
// Object interface generation
// ---------------------------------------------------------------------------

describe("generateObjectInterface", () => {
  it("generates a TypeScript interface for an object type", () => {
    const output = generateObjectInterface(createEmployeeObjectType());

    expect(output).toContain("export interface Employee {");
    expect(output).toContain("readonly employeeId: string;");
    expect(output).toContain("readonly firstName: string;");
    expect(output).toContain("}");
  });

  it("marks primary key as readonly", () => {
    const output = generateObjectInterface(createEmployeeObjectType());
    expect(output).toContain("readonly employeeId: string;");
  });

  it("marks nullable properties with ?", () => {
    const output = generateObjectInterface(createEmployeeObjectType());
    expect(output).toContain("readonly startDate?: string;");
  });

  it("generates Array<T> for array properties", () => {
    const output = generateObjectInterface(createEmployeeObjectType());
    expect(output).toContain("readonly tags: Array<string>;");
  });

  it("maps all property types correctly", () => {
    expect(mapPropertyTypeToTs("STRING")).toBe("string");
    expect(mapPropertyTypeToTs("BOOLEAN")).toBe("boolean");
    expect(mapPropertyTypeToTs("INTEGER")).toBe("number");
    expect(mapPropertyTypeToTs("LONG")).toBe("bigint");
    expect(mapPropertyTypeToTs("DOUBLE")).toBe("number");
    expect(mapPropertyTypeToTs("FLOAT")).toBe("number");
    expect(mapPropertyTypeToTs("DECIMAL")).toBe("string");
    expect(mapPropertyTypeToTs("BYTE")).toBe("number");
    expect(mapPropertyTypeToTs("SHORT")).toBe("number");
    expect(mapPropertyTypeToTs("DATE")).toBe("string");
    expect(mapPropertyTypeToTs("TIMESTAMP")).toBe("string");
    expect(mapPropertyTypeToTs("ATTACHMENT")).toBe("string");
    expect(mapPropertyTypeToTs("GEOSHAPE")).toBe("GeoJsonGeometry");
    expect(mapPropertyTypeToTs("GEOHASH")).toBe("string");
    expect(mapPropertyTypeToTs("GEOPOINT")).toBe("GeoPoint");
    expect(mapPropertyTypeToTs("MARKING")).toBe("string");
    expect(mapPropertyTypeToTs("VECTOR")).toBe("number[]");
    expect(mapPropertyTypeToTs("TIMESERIES")).toBe("TimeseriesReference");
    expect(mapPropertyTypeToTs("STRUCT")).toBe("Record<string, unknown>");
    expect(mapPropertyTypeToTs("MEDIA_REFERENCE")).toBe("string");
    expect(mapPropertyTypeToTs("RID")).toBe("string");
  });

  it("maps INTEGER to number and BOOLEAN to boolean in generated output", () => {
    const output = generateObjectInterface(createEmployeeObjectType());
    expect(output).toContain("readonly age: number;");
    expect(output).toContain("readonly isActive: boolean;");
    expect(output).toContain("readonly score: number;");
  });
});

// ---------------------------------------------------------------------------
// Action types generation
// ---------------------------------------------------------------------------

describe("generateActionTypes", () => {
  it("generates a TypeScript params interface for an action", () => {
    const output = generateActionTypes(createActionType());

    expect(output).toContain("export interface CreateEmployeeParams {");
    expect(output).toContain("firstName: string;");
    expect(output).toContain("lastName: string;");
    expect(output).toContain("}");
  });

  it("marks optional parameters with ?", () => {
    const output = generateActionTypes(createActionType());
    expect(output).toContain("startDate?: string;");
  });

  it("generates correct params interface name", () => {
    expect(getParamsInterfaceName("createEmployee")).toBe(
      "CreateEmployeeParams",
    );
    expect(getParamsInterfaceName("deleteUser")).toBe("DeleteUserParams");
  });
});

// ---------------------------------------------------------------------------
// Client generation
// ---------------------------------------------------------------------------

describe("generateTypedClient", () => {
  it("generates an OntologyClient interface", () => {
    const output = generateTypedClient(createTestIr());

    expect(output).toContain("export interface OntologyClient {");
    expect(output).toContain("objects: {");
    expect(output).toContain("Employee: ObjectApi<Employee>;");
    expect(output).toContain("Department: ObjectApi<Department>;");
    expect(output).toContain("actions: {");
    expect(output).toContain("createEmployee: (params: CreateEmployeeParams) => Promise<ActionResult>;");
  });

  it("includes ObjectApi and ActionResult types", () => {
    const output = generateTypedClient(createTestIr());

    expect(output).toContain("export interface ObjectApi<T>");
    expect(output).toContain("export interface ActionResult");
  });
});

// ---------------------------------------------------------------------------
// Full generation pipeline
// ---------------------------------------------------------------------------

describe("generateFromOntologyIr", () => {
  it("generates the correct number of files", () => {
    const result = generateFromOntologyIr(createTestIr());

    // 2 object files + 1 actions file + 1 client file + 1 index file = 5
    expect(result.files).toHaveLength(5);
  });

  it("generates one file per object type", () => {
    const result = generateFromOntologyIr(createTestIr());
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain("generated/Employee.ts");
    expect(paths).toContain("generated/Department.ts");
  });

  it("generates an actions file", () => {
    const result = generateFromOntologyIr(createTestIr());
    const actionsFile = result.files.find(
      (f) => f.path === "generated/actions.ts",
    );

    expect(actionsFile).toBeDefined();
    expect(actionsFile!.content).toContain("CreateEmployeeParams");
  });

  it("generates a client file with imports", () => {
    const result = generateFromOntologyIr(createTestIr());
    const clientFile = result.files.find(
      (f) => f.path === "generated/client.ts",
    );

    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain("OntologyClient");
    expect(clientFile!.content).toContain('import type { Employee }');
    expect(clientFile!.content).toContain('import type { Department }');
  });

  it("generates an index file that re-exports all types", () => {
    const result = generateFromOntologyIr(createTestIr());
    const indexFile = result.files.find(
      (f) => f.path === "generated/index.ts",
    );

    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain('export type { Employee }');
    expect(indexFile!.content).toContain('export type { Department }');
    expect(indexFile!.content).toContain('export type { CreateEmployeeParams }');
    expect(indexFile!.content).toContain("export type { OntologyClient");
  });

  it("respects custom outputDir option", () => {
    const result = generateFromOntologyIr(createTestIr(), {
      outputDir: "src/sdk",
    });
    const paths = result.files.map((f) => f.path);

    expect(paths[0]).toMatch(/^src\/sdk\//);
  });

  it("includes auto-generated comment in all files", () => {
    const result = generateFromOntologyIr(createTestIr());

    for (const file of result.files) {
      expect(file.content).toContain("Auto-generated from OntologyIr");
    }
  });
});
