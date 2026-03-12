import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("Ontology-to-SDK flow: define, generate TypeScript SDK", () => {
  let ontologyApp: FastifyInstance;
  let ontologyRid: string;

  beforeAll(async () => {
    const { createServer: createOntologyServer } = await import(
      "../../services/svc-ontology/src/server.js"
    );
    ontologyApp = await createOntologyServer();
  });

  afterAll(async () => {
    await ontologyApp?.close();
  });

  it("creates an ontology with multiple object types via the API", async () => {
    // Create ontology
    const ontRes = await ontologyApp.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "hr-ontology",
        displayName: "HR Ontology",
        description: "Human resources domain model",
      },
    });
    expect(ontRes.statusCode).toBe(201);
    ontologyRid = ontRes.json().rid;

    // Create Employee object type
    const empRes = await ontologyApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "Employee",
        description: "An employee in the organization",
        primaryKeyApiName: "employeeId",
        primaryKeyType: "STRING",
        titlePropertyApiName: "fullName",
        properties: {
          employeeId: { type: "STRING", nullable: false, multiplicity: "SINGLE" },
          fullName: { type: "STRING", nullable: false, multiplicity: "SINGLE" },
          email: { type: "STRING", nullable: true, multiplicity: "SINGLE" },
          hireDate: { type: "DATE", nullable: true, multiplicity: "SINGLE" },
          departmentId: { type: "STRING", nullable: true, multiplicity: "SINGLE" },
        },
        implements: [],
        status: "ACTIVE",
      },
    });
    expect(empRes.statusCode).toBe(201);

    // Create Department object type
    const deptRes = await ontologyApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "Department",
        description: "A department in the organization",
        primaryKeyApiName: "departmentId",
        primaryKeyType: "STRING",
        titlePropertyApiName: "name",
        properties: {
          departmentId: { type: "STRING", nullable: false, multiplicity: "SINGLE" },
          name: { type: "STRING", nullable: false, multiplicity: "SINGLE" },
          budget: { type: "DOUBLE", nullable: true, multiplicity: "SINGLE" },
        },
        implements: [],
        status: "ACTIVE",
      },
    });
    expect(deptRes.statusCode).toBe(201);
  });

  it("creates link types between object types", async () => {
    const res = await ontologyApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/linkTypes`,
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "employeeDepartment",
        objectTypeApiName: "Employee",
        linkedObjectTypeApiName: "Department",
        cardinality: "MANY",
        foreignKeyPropertyApiName: "departmentId",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.apiName).toBe("employeeDepartment");
    expect(body.objectTypeApiName).toBe("Employee");
    expect(body.linkedObjectTypeApiName).toBe("Department");
  });

  it("creates action types", async () => {
    const res = await ontologyApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      headers: { "content-type": "application/json" },
      payload: {
        apiName: "hireEmployee",
        description: "Hire a new employee",
        parameters: {
          fullName: { type: "STRING", required: true, description: "Employee name" },
          email: { type: "STRING", required: true, description: "Email address" },
          departmentId: { type: "STRING", required: true, description: "Department ID" },
        },
        modifiedEntities: {
          Employee: { created: true, modified: false },
        },
        status: "ACTIVE",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().apiName).toBe("hireEmployee");
  });

  it("uses the ontology-maker to define an ontology programmatically", async () => {
    const { defineOntology } = await import(
      "../../packages/ontology-maker/src/index.js"
    );

    const ontology = defineOntology("inventory", (ont) => {
      ont
        .displayName("Inventory System")
        .description("Product and warehouse management")
        .object("Product", (o) => {
          o.description("A product in inventory")
            .property("sku", "STRING")
            .property("name", "STRING")
            .property("price", "DOUBLE", { nullable: true })
            .property("warehouseId", "STRING", { nullable: true })
            .primaryKey("sku")
            .titleProperty("name");
        })
        .object("Warehouse", (o) => {
          o.description("A warehouse location")
            .property("warehouseId", "STRING")
            .property("location", "STRING")
            .property("capacity", "INTEGER", { nullable: true })
            .primaryKey("warehouseId")
            .titleProperty("location");
        })
        .link("productWarehouse", (l) => {
          l.from("Product").to("Warehouse").cardinality("MANY");
        })
        .action("restock", (a) => {
          a.description("Restock a product in a warehouse")
            .parameter("sku", "STRING", { required: true })
            .parameter("quantity", "INTEGER", { required: true })
            .modifies("Product", "MODIFIED");
        });
    });

    expect(ontology.apiName).toBe("inventory");
    expect(Object.keys(ontology.objectTypes)).toEqual(["Product", "Warehouse"]);
    expect(Object.keys(ontology.linkTypes)).toEqual(["productWarehouse"]);
    expect(Object.keys(ontology.actionTypes)).toEqual(["restock"]);
    expect(ontology.objectTypes.Product.primaryKeyApiName).toBe("sku");
    expect(ontology.objectTypes.Warehouse.properties.capacity.type).toBe("INTEGER");
  });

  it("uses the ontology-generator to generate TypeScript SDK code", async () => {
    const { defineOntology } = await import(
      "../../packages/ontology-maker/src/index.js"
    );
    const { ontologyToIr } = await import(
      "../../packages/ontology-ir/src/index.js"
    );
    const { generateFromOntologyIr } = await import(
      "../../packages/ontology-generator/src/index.js"
    );

    // Define an ontology via the maker
    const ontology = defineOntology("crm", (ont) => {
      ont
        .displayName("CRM")
        .description("Customer relationship management")
        .object("Customer", (o) => {
          o.description("A customer")
            .property("customerId", "STRING")
            .property("name", "STRING")
            .property("email", "STRING", { nullable: true })
            .primaryKey("customerId")
            .titleProperty("name");
        })
        .object("Deal", (o) => {
          o.description("A sales deal")
            .property("dealId", "STRING")
            .property("title", "STRING")
            .property("amount", "DOUBLE", { nullable: true })
            .primaryKey("dealId")
            .titleProperty("title");
        })
        .action("closeWon", (a) => {
          a.description("Mark a deal as closed-won")
            .parameter("dealId", "STRING", { required: true })
            .modifies("Deal", "MODIFIED");
        });
    });

    // Convert to IR
    const ir = ontologyToIr(ontology);
    expect(ir.apiName).toBe("crm");
    expect(Object.keys(ir.objectTypes)).toContain("Customer");
    expect(Object.keys(ir.objectTypes)).toContain("Deal");

    // Generate SDK code
    const output = generateFromOntologyIr(ir);
    expect(output.files.length).toBeGreaterThanOrEqual(4); // Customer.ts, Deal.ts, actions.ts, client.ts, index.ts
  });

  it("verifies generated SDK code structure", async () => {
    const { defineOntology } = await import(
      "../../packages/ontology-maker/src/index.js"
    );
    const { ontologyToIr } = await import(
      "../../packages/ontology-ir/src/index.js"
    );
    const { generateFromOntologyIr } = await import(
      "../../packages/ontology-generator/src/index.js"
    );

    const ontology = defineOntology("simple", (ont) => {
      ont
        .displayName("Simple")
        .description("A simple test ontology")
        .object("Task", (o) => {
          o.description("A task")
            .property("taskId", "STRING")
            .property("title", "STRING")
            .property("done", "BOOLEAN", { nullable: true })
            .primaryKey("taskId")
            .titleProperty("title");
        })
        .action("completeTask", (a) => {
          a.description("Mark a task as complete")
            .parameter("taskId", "STRING", { required: true })
            .modifies("Task", "MODIFIED");
        });
    });

    const ir = ontologyToIr(ontology);
    const output = generateFromOntologyIr(ir, { outputDir: "sdk-output" });

    // Check that we get the expected files
    const filePaths = output.files.map((f) => f.path);
    expect(filePaths).toContain("sdk-output/Task.ts");
    expect(filePaths).toContain("sdk-output/actions.ts");
    expect(filePaths).toContain("sdk-output/client.ts");
    expect(filePaths).toContain("sdk-output/index.ts");

    // Verify object type file has the interface
    const taskFile = output.files.find((f) => f.path === "sdk-output/Task.ts");
    expect(taskFile).toBeDefined();
    expect(taskFile!.content).toContain("export interface Task");
    expect(taskFile!.content).toContain("taskId");
    expect(taskFile!.content).toContain("title");
    expect(taskFile!.content).toContain("done");

    // Verify actions file has action parameter types
    const actionsFile = output.files.find((f) => f.path === "sdk-output/actions.ts");
    expect(actionsFile).toBeDefined();
    expect(actionsFile!.content).toContain("CompleteTaskParams");

    // Verify index file re-exports
    const indexFile = output.files.find((f) => f.path === "sdk-output/index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("Task");

    // Verify client file exists and contains the OntologyClient type
    const clientFile = output.files.find((f) => f.path === "sdk-output/client.ts");
    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain("OntologyClient");
  });
});
