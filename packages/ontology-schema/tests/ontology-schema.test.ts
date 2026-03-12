import { describe, it, expect } from "vitest";
import {
  PropertyType,
  Multiplicity,
  stringProperty,
  integerProperty,
  booleanProperty,
  timestampProperty,
  ridProperty,
  arrayProperty,
  vectorProperty,
  ObjectTypeStatus,
  validateObjectType,
  ActionTypeStatus,
  validateActionType,
  LinkCardinality,
  validateLinkType,
  validateInterfaceType,
  QueryOutputType,
  validateQueryType,
  validateOntology,
  type ObjectTypeDefinition,
  type ActionTypeDefinition,
  type LinkTypeDefinition,
  type InterfaceTypeDefinition,
  type QueryTypeDefinition,
  type OntologyDefinition,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Property types
// ---------------------------------------------------------------------------

describe("PropertyType", () => {
  it("enumerates all 21 property types", () => {
    const types = Object.values(PropertyType);
    expect(types).toHaveLength(21);
    expect(types).toContain("STRING");
    expect(types).toContain("BOOLEAN");
    expect(types).toContain("INTEGER");
    expect(types).toContain("LONG");
    expect(types).toContain("DOUBLE");
    expect(types).toContain("FLOAT");
    expect(types).toContain("DECIMAL");
    expect(types).toContain("BYTE");
    expect(types).toContain("SHORT");
    expect(types).toContain("DATE");
    expect(types).toContain("TIMESTAMP");
    expect(types).toContain("ATTACHMENT");
    expect(types).toContain("GEOSHAPE");
    expect(types).toContain("GEOHASH");
    expect(types).toContain("GEOPOINT");
    expect(types).toContain("MARKING");
    expect(types).toContain("VECTOR");
    expect(types).toContain("TIMESERIES");
    expect(types).toContain("STRUCT");
    expect(types).toContain("MEDIA_REFERENCE");
    expect(types).toContain("RID");
  });
});

describe("Multiplicity", () => {
  it("has SINGLE, ARRAY, and SET", () => {
    expect(Multiplicity.SINGLE).toBe("SINGLE");
    expect(Multiplicity.ARRAY).toBe("ARRAY");
    expect(Multiplicity.SET).toBe("SET");
  });
});

describe("property helpers", () => {
  it("creates a string property", () => {
    const prop = stringProperty({ description: "A name" });
    expect(prop.type).toBe("STRING");
    expect(prop.nullable).toBe(false);
    expect(prop.multiplicity).toBe("SINGLE");
    expect(prop.description).toBe("A name");
  });

  it("creates a nullable integer property", () => {
    const prop = integerProperty({ nullable: true });
    expect(prop.type).toBe("INTEGER");
    expect(prop.nullable).toBe(true);
  });

  it("creates a boolean property", () => {
    const prop = booleanProperty();
    expect(prop.type).toBe("BOOLEAN");
    expect(prop.nullable).toBe(false);
  });

  it("creates a timestamp property", () => {
    const prop = timestampProperty({ nullable: true });
    expect(prop.type).toBe("TIMESTAMP");
    expect(prop.nullable).toBe(true);
  });

  it("creates a RID property", () => {
    const prop = ridProperty();
    expect(prop.type).toBe("RID");
  });

  it("creates an array property", () => {
    const prop = arrayProperty("STRING", { description: "tags" });
    expect(prop.type).toBe("STRING");
    expect(prop.multiplicity).toBe("ARRAY");
  });

  it("creates a vector property with dimension", () => {
    const prop = vectorProperty(128);
    expect(prop.type).toBe("VECTOR");
    expect(prop.vectorDimension).toBe(128);
  });
});

// ---------------------------------------------------------------------------
// Object type validation
// ---------------------------------------------------------------------------

describe("validateObjectType", () => {
  const validObject: ObjectTypeDefinition = {
    apiName: "Employee",
    description: "An employee in the organization",
    primaryKeyApiName: "employeeId",
    primaryKeyType: PropertyType.STRING,
    titlePropertyApiName: "fullName",
    properties: {
      employeeId: stringProperty({ description: "Unique employee ID" }),
      fullName: stringProperty({ description: "Full name" }),
      email: stringProperty({ nullable: true, description: "Email address" }),
      isActive: booleanProperty({ description: "Whether active" }),
      hireDate: timestampProperty({ description: "Hire date" }),
    },
    implements: [],
    status: ObjectTypeStatus.ACTIVE,
  };

  it("accepts a valid object type", () => {
    expect(validateObjectType(validObject)).toEqual([]);
  });

  it("rejects empty apiName", () => {
    const errors = validateObjectType({ ...validObject, apiName: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("apiName");
  });

  it("rejects missing primary key in properties", () => {
    const errors = validateObjectType({
      ...validObject,
      primaryKeyApiName: "nonexistent",
    });
    expect(errors.some((e) => e.field === "primaryKeyApiName")).toBe(true);
  });

  it("rejects missing title property in properties", () => {
    const errors = validateObjectType({
      ...validObject,
      titlePropertyApiName: "nonexistent",
    });
    expect(errors.some((e) => e.field === "titlePropertyApiName")).toBe(true);
  });

  it("rejects nullable primary key", () => {
    const errors = validateObjectType({
      ...validObject,
      properties: {
        ...validObject.properties,
        employeeId: stringProperty({ nullable: true }),
      },
    });
    expect(errors.some((e) => e.message.includes("nullable"))).toBe(true);
  });

  it("rejects empty properties", () => {
    const errors = validateObjectType({ ...validObject, properties: {} });
    expect(errors.some((e) => e.field === "properties")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Action type validation
// ---------------------------------------------------------------------------

describe("validateActionType", () => {
  const validAction: ActionTypeDefinition = {
    apiName: "createEmployee",
    description: "Creates a new employee record",
    parameters: {
      fullName: {
        type: PropertyType.STRING,
        required: true,
        description: "Employee full name",
      },
      email: {
        type: PropertyType.STRING,
        required: false,
        description: "Employee email",
      },
    },
    modifiedEntities: {
      Employee: { created: true, modified: false },
    },
    status: ActionTypeStatus.ACTIVE,
  };

  it("accepts a valid action type", () => {
    expect(validateActionType(validAction)).toEqual([]);
  });

  it("rejects empty apiName", () => {
    const errors = validateActionType({ ...validAction, apiName: "" });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("apiName");
  });

  it("rejects entity with neither created nor modified", () => {
    const errors = validateActionType({
      ...validAction,
      modifiedEntities: {
        Employee: { created: false, modified: false },
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toContain("modifiedEntities");
  });
});

// ---------------------------------------------------------------------------
// Link type validation
// ---------------------------------------------------------------------------

describe("validateLinkType", () => {
  const validLink: LinkTypeDefinition = {
    apiName: "employeeDepartment",
    objectTypeApiName: "Employee",
    linkedObjectTypeApiName: "Department",
    cardinality: LinkCardinality.MANY,
    foreignKeyPropertyApiName: "departmentId",
  };

  it("accepts a valid link type", () => {
    expect(validateLinkType(validLink)).toEqual([]);
  });

  it("rejects empty objectTypeApiName", () => {
    const errors = validateLinkType({ ...validLink, objectTypeApiName: "" });
    expect(errors.some((e) => e.field === "objectTypeApiName")).toBe(true);
  });

  it("rejects self-referential links", () => {
    const errors = validateLinkType({
      ...validLink,
      linkedObjectTypeApiName: "Employee",
      objectTypeApiName: "Employee",
    });
    expect(errors.some((e) => e.message.includes("self-referential"))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Interface type validation
// ---------------------------------------------------------------------------

describe("validateInterfaceType", () => {
  const validInterface: InterfaceTypeDefinition = {
    apiName: "Timestamped",
    description: "Entities with creation and modification timestamps",
    properties: {
      createdAt: timestampProperty({ description: "Creation time" }),
      updatedAt: timestampProperty({
        nullable: true,
        description: "Last update time",
      }),
    },
    extendsInterfaces: [],
  };

  it("accepts a valid interface type", () => {
    expect(validateInterfaceType(validInterface)).toEqual([]);
  });

  it("rejects self-extension", () => {
    const errors = validateInterfaceType({
      ...validInterface,
      extendsInterfaces: ["Timestamped"],
    });
    expect(errors.some((e) => e.message.includes("itself"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Query type validation
// ---------------------------------------------------------------------------

describe("validateQueryType", () => {
  const validQuery: QueryTypeDefinition = {
    apiName: "getActiveEmployees",
    version: "1.0.0",
    description: "Returns all active employees",
    parameters: {
      department: {
        type: PropertyType.STRING,
        required: false,
        description: "Filter by department",
      },
    },
    output: {
      type: QueryOutputType.OBJECT_SET,
      objectTypeApiName: "Employee",
    },
  };

  it("accepts a valid query type", () => {
    expect(validateQueryType(validQuery)).toEqual([]);
  });

  it("rejects empty version", () => {
    const errors = validateQueryType({ ...validQuery, version: "" });
    expect(errors.some((e) => e.field === "version")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ontology-level cross-reference validation
// ---------------------------------------------------------------------------

describe("validateOntology", () => {
  const employee: ObjectTypeDefinition = {
    apiName: "Employee",
    description: "An employee",
    primaryKeyApiName: "id",
    primaryKeyType: PropertyType.STRING,
    titlePropertyApiName: "name",
    properties: {
      id: stringProperty(),
      name: stringProperty(),
      departmentId: stringProperty({ nullable: true }),
    },
    implements: ["Timestamped"],
    status: ObjectTypeStatus.ACTIVE,
  };

  const department: ObjectTypeDefinition = {
    apiName: "Department",
    description: "A department",
    primaryKeyApiName: "id",
    primaryKeyType: PropertyType.STRING,
    titlePropertyApiName: "name",
    properties: {
      id: stringProperty(),
      name: stringProperty(),
    },
    implements: [],
    status: ObjectTypeStatus.ACTIVE,
  };

  const timestamped: InterfaceTypeDefinition = {
    apiName: "Timestamped",
    description: "Has timestamps",
    properties: {
      createdAt: timestampProperty(),
    },
    extendsInterfaces: [],
  };

  const validOntology: OntologyDefinition = {
    rid: "ri.ontology.main.ontology.test-ontology",
    apiName: "test-ontology",
    displayName: "Test Ontology",
    description: "A test ontology",
    objectTypes: { Employee: employee, Department: department },
    actionTypes: {
      createEmployee: {
        apiName: "createEmployee",
        description: "Create an employee",
        parameters: {},
        modifiedEntities: { Employee: { created: true, modified: false } },
        status: ActionTypeStatus.ACTIVE,
      },
    },
    linkTypes: {
      employeeDepartment: {
        apiName: "employeeDepartment",
        objectTypeApiName: "Employee",
        linkedObjectTypeApiName: "Department",
        cardinality: LinkCardinality.MANY,
        foreignKeyPropertyApiName: "departmentId",
      },
    },
    interfaceTypes: { Timestamped: timestamped },
    queryTypes: {},
  };

  it("accepts a valid ontology", () => {
    expect(validateOntology(validOntology)).toEqual([]);
  });

  it("detects unknown object type in link", () => {
    const errors = validateOntology({
      ...validOntology,
      linkTypes: {
        broken: {
          apiName: "broken",
          objectTypeApiName: "Ghost",
          linkedObjectTypeApiName: "Department",
          cardinality: LinkCardinality.ONE,
          foreignKeyPropertyApiName: "ghostId",
        },
      },
    });
    expect(errors.some((e) => e.message.includes("Ghost"))).toBe(true);
  });

  it("detects unknown interface in object type implements", () => {
    const errors = validateOntology({
      ...validOntology,
      objectTypes: {
        ...validOntology.objectTypes,
        Employee: { ...employee, implements: ["NonExistent"] },
      },
    });
    expect(errors.some((e) => e.message.includes("NonExistent"))).toBe(true);
  });

  it("detects unknown object type in action modifiedEntities", () => {
    const errors = validateOntology({
      ...validOntology,
      actionTypes: {
        broken: {
          apiName: "broken",
          description: "Broken action",
          parameters: {},
          modifiedEntities: { Missing: { created: true, modified: false } },
          status: ActionTypeStatus.ACTIVE,
        },
      },
    });
    expect(errors.some((e) => e.message.includes("Missing"))).toBe(true);
  });

  it("detects unknown interface in extendsInterfaces", () => {
    const errors = validateOntology({
      ...validOntology,
      interfaceTypes: {
        Broken: {
          apiName: "Broken",
          description: "Broken interface",
          properties: {},
          extendsInterfaces: ["Missing"],
        },
      },
    });
    expect(errors.some((e) => e.message.includes("Missing"))).toBe(true);
  });
});
