import { describe, it, expect } from "vitest";
import { defineObject } from "../src/define-object.js";
import { defineAction } from "../src/define-action.js";
import { defineLink } from "../src/define-link.js";
import { defineInterface } from "../src/define-interface.js";
import { defineOntology } from "../src/define-ontology.js";
import { validateOntology } from "@openfoundry/ontology-schema";

// ---------------------------------------------------------------------------
// defineObject
// ---------------------------------------------------------------------------

describe("defineObject", () => {
  it("creates a valid ObjectTypeDefinition", () => {
    const obj = defineObject("Employee", (o) => {
      o.description("An employee record")
        .property("employeeId", "STRING")
        .property("fullName", "STRING")
        .primaryKey("employeeId")
        .titleProperty("fullName");
    });

    expect(obj.apiName).toBe("Employee");
    expect(obj.description).toBe("An employee record");
    expect(obj.primaryKeyApiName).toBe("employeeId");
    expect(obj.titlePropertyApiName).toBe("fullName");
    expect(obj.status).toBe("ACTIVE");
  });

  it("supports all property types", () => {
    const obj = defineObject("AllTypes", (o) => {
      o.description("Object with all types")
        .property("id", "STRING")
        .property("isActive", "BOOLEAN")
        .property("count", "INTEGER")
        .property("bigNum", "LONG")
        .property("ratio", "DOUBLE")
        .property("precise", "FLOAT")
        .property("money", "DECIMAL")
        .property("small", "BYTE")
        .property("medium", "SHORT")
        .property("birthday", "DATE")
        .property("createdAt", "TIMESTAMP")
        .property("file", "ATTACHMENT")
        .property("region", "GEOSHAPE")
        .property("hash", "GEOHASH")
        .property("location", "GEOPOINT")
        .property("mark", "MARKING")
        .property("embedding", "VECTOR")
        .property("series", "TIMESERIES")
        .property("data", "STRUCT")
        .property("media", "MEDIA_REFERENCE")
        .property("ref", "RID")
        .primaryKey("id");
    });

    expect(Object.keys(obj.properties)).toHaveLength(21);
    expect(obj.properties["isActive"].type).toBe("BOOLEAN");
    expect(obj.properties["count"].type).toBe("INTEGER");
    expect(obj.properties["embedding"].type).toBe("VECTOR");
  });

  it("supports nullable properties", () => {
    const obj = defineObject("WithNullable", (o) => {
      o.description("Object with nullable props")
        .property("id", "STRING")
        .property("nickname", "STRING", { nullable: true })
        .primaryKey("id");
    });

    expect(obj.properties["id"].nullable).toBe(false);
    expect(obj.properties["nickname"].nullable).toBe(true);
  });

  it("supports implements", () => {
    const obj = defineObject("TaggedItem", (o) => {
      o.description("An item with tags")
        .property("id", "STRING")
        .primaryKey("id")
        .implements("Identifiable", "Taggable");
    });

    expect(obj.implements).toEqual(["Identifiable", "Taggable"]);
  });

  it("throws when primaryKey is missing", () => {
    expect(() =>
      defineObject("Bad", (o) => {
        o.description("Missing pk").property("id", "STRING");
      }),
    ).toThrow("primaryKey is required");
  });

  it("throws when description is missing", () => {
    expect(() =>
      defineObject("Bad", (o) => {
        o.property("id", "STRING").primaryKey("id");
      }),
    ).toThrow("description is required");
  });

  it("throws when no properties are defined", () => {
    expect(() =>
      defineObject("Bad", (o) => {
        o.description("No props").primaryKey("id");
      }),
    ).toThrow("at least one property is required");
  });

  it("throws when primaryKey references undefined property", () => {
    expect(() =>
      defineObject("Bad", (o) => {
        o.description("Bad pk ref")
          .property("name", "STRING")
          .primaryKey("id");
      }),
    ).toThrow('primaryKey "id" is not defined in properties');
  });

  it("defaults titleProperty to primaryKey if not set", () => {
    const obj = defineObject("Simple", (o) => {
      o.description("Simple obj")
        .property("id", "STRING")
        .primaryKey("id");
    });

    expect(obj.titlePropertyApiName).toBe("id");
  });
});

// ---------------------------------------------------------------------------
// defineAction
// ---------------------------------------------------------------------------

describe("defineAction", () => {
  it("creates a valid ActionTypeDefinition with parameters and modifications", () => {
    const action = defineAction("createEmployee", (a) => {
      a.description("Creates a new employee")
        .parameter("fullName", "STRING", {
          required: true,
          description: "Employee name",
        })
        .parameter("age", "INTEGER", { required: false })
        .modifies("Employee", "CREATED");
    });

    expect(action.apiName).toBe("createEmployee");
    expect(action.description).toBe("Creates a new employee");
    expect(action.parameters["fullName"].type).toBe("STRING");
    expect(action.parameters["fullName"].required).toBe(true);
    expect(action.parameters["age"].required).toBe(false);
    expect(action.modifiedEntities["Employee"].created).toBe(true);
  });

  it("throws when description is missing", () => {
    expect(() =>
      defineAction("bad", (a) => {
        a.parameter("x", "STRING");
      }),
    ).toThrow("description is required");
  });

  it("supports MODIFIED modification type", () => {
    const action = defineAction("updateEmployee", (a) => {
      a.description("Updates an employee").modifies("Employee", "MODIFIED");
    });

    expect(action.modifiedEntities["Employee"].modified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// defineLink
// ---------------------------------------------------------------------------

describe("defineLink", () => {
  it("creates a valid LinkTypeDefinition with cardinality", () => {
    const link = defineLink("employeeDepartment", (l) => {
      l.from("Employee").to("Department").cardinality("MANY");
    });

    expect(link.apiName).toBe("employeeDepartment");
    expect(link.objectTypeApiName).toBe("Employee");
    expect(link.linkedObjectTypeApiName).toBe("Department");
    expect(link.cardinality).toBe("MANY");
  });

  it("supports ONE cardinality", () => {
    const link = defineLink("employeeManager", (l) => {
      l.from("Employee").to("Employee").cardinality("ONE");
    });

    expect(link.cardinality).toBe("ONE");
  });

  it("throws when from is missing", () => {
    expect(() =>
      defineLink("bad", (l) => {
        l.to("Something");
      }),
    ).toThrow("from (objectType) is required");
  });

  it("throws when to is missing", () => {
    expect(() =>
      defineLink("bad", (l) => {
        l.from("Something");
      }),
    ).toThrow("to (objectType) is required");
  });
});

// ---------------------------------------------------------------------------
// defineInterface
// ---------------------------------------------------------------------------

describe("defineInterface", () => {
  it("creates a valid InterfaceTypeDefinition with extends", () => {
    const iface = defineInterface("Auditable", (i) => {
      i.description("Tracks audit fields")
        .property("createdAt", "TIMESTAMP")
        .property("updatedAt", "TIMESTAMP", { nullable: true })
        .extends("Identifiable");
    });

    expect(iface.apiName).toBe("Auditable");
    expect(iface.properties["createdAt"].type).toBe("TIMESTAMP");
    expect(iface.properties["updatedAt"].nullable).toBe(true);
    expect(iface.extendsInterfaces).toEqual(["Identifiable"]);
  });

  it("throws when description is missing", () => {
    expect(() =>
      defineInterface("bad", (i) => {
        i.property("id", "STRING");
      }),
    ).toThrow("description is required");
  });
});

// ---------------------------------------------------------------------------
// defineOntology
// ---------------------------------------------------------------------------

describe("defineOntology", () => {
  it("composes all entity types into a valid OntologyDefinition", () => {
    const ontology = defineOntology("hr-ontology", (ont) => {
      ont
        .displayName("HR Ontology")
        .description("Human resources ontology")
        .object("Employee", (o) => {
          o.description("An employee")
            .property("employeeId", "STRING")
            .property("fullName", "STRING")
            .property("departmentId", "STRING")
            .primaryKey("employeeId")
            .titleProperty("fullName");
        })
        .object("Department", (o) => {
          o.description("A department")
            .property("departmentId", "STRING")
            .property("name", "STRING")
            .primaryKey("departmentId")
            .titleProperty("name");
        })
        .action("createEmployee", (a) => {
          a.description("Creates an employee")
            .parameter("fullName", "STRING")
            .parameter("departmentId", "STRING")
            .modifies("Employee", "CREATED");
        })
        .link("employeeDepartment", (l) => {
          l.from("Employee")
            .to("Department")
            .cardinality("MANY")
            .foreignKey("departmentId");
        })
        .interface("Identifiable", (i) => {
          i.description("Has an ID").property("id", "STRING");
        });
    });

    expect(ontology.apiName).toBe("hr-ontology");
    expect(ontology.displayName).toBe("HR Ontology");
    expect(ontology.description).toBe("Human resources ontology");
    expect(Object.keys(ontology.objectTypes)).toEqual([
      "Employee",
      "Department",
    ]);
    expect(Object.keys(ontology.actionTypes)).toEqual(["createEmployee"]);
    expect(Object.keys(ontology.linkTypes)).toEqual(["employeeDepartment"]);
    expect(Object.keys(ontology.interfaceTypes)).toEqual(["Identifiable"]);
  });

  it("builder chaining works across methods", () => {
    const ontology = defineOntology("chained", (ont) => {
      ont
        .displayName("Chained")
        .description("Testing chaining")
        .object("Item", (o) => {
          o.description("An item")
            .property("id", "STRING")
            .primaryKey("id");
        });
    });

    expect(ontology.apiName).toBe("chained");
    expect(ontology.objectTypes["Item"]).toBeDefined();
  });

  it("validates successfully with ontology-schema validateOntology", () => {
    const ontology = defineOntology("validated", (ont) => {
      ont.description("A validated ontology").object("Widget", (o) => {
        o.description("A widget")
          .property("widgetId", "STRING")
          .primaryKey("widgetId");
      });
    });

    const errors = validateOntology(ontology);
    expect(errors).toEqual([]);
  });

  it("throws when description is missing", () => {
    expect(() =>
      defineOntology("bad", (ont) => {
        ont.displayName("Bad");
      }),
    ).toThrow("description is required");
  });
});
