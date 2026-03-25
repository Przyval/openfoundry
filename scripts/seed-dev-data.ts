#!/usr/bin/env npx tsx
// Seeds the dev environment with sample data

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:8080";

async function seed() {
  console.log("🌱 Seeding OpenFoundry dev environment...\n");

  // 1. Create a default ontology
  const ontology = await post("/api/v2/ontologies", {
    apiName: "sample-ontology",
    displayName: "Sample Ontology",
    description: "A sample ontology for development",
  });
  console.log(`✓ Created ontology: ${ontology.rid}`);

  // 2. Create object types
  const employeeType = await post(
    `/api/v2/ontologies/${ontology.rid}/objectTypes`,
    {
      apiName: "Employee",
      displayName: "Employee",
      description: "An employee in the organization",
      primaryKey: "employeeId",
      properties: {
        employeeId: {
          apiName: "employeeId",
          displayName: "Employee ID",
          dataType: "STRING",
        },
        firstName: {
          apiName: "firstName",
          displayName: "First Name",
          dataType: "STRING",
        },
        lastName: {
          apiName: "lastName",
          displayName: "Last Name",
          dataType: "STRING",
        },
        email: {
          apiName: "email",
          displayName: "Email",
          dataType: "STRING",
        },
        department: {
          apiName: "department",
          displayName: "Department",
          dataType: "STRING",
        },
        startDate: {
          apiName: "startDate",
          displayName: "Start Date",
          dataType: "DATETIME",
        },
        salary: {
          apiName: "salary",
          displayName: "Salary",
          dataType: "DOUBLE",
        },
      },
    },
  );
  console.log(`✓ Created object type: Employee`);

  // Create Department type
  const departmentType = await post(
    `/api/v2/ontologies/${ontology.rid}/objectTypes`,
    {
      apiName: "Department",
      displayName: "Department",
      description: "A department in the organization",
      primaryKey: "departmentId",
      properties: {
        departmentId: {
          apiName: "departmentId",
          displayName: "Department ID",
          dataType: "STRING",
        },
        name: {
          apiName: "name",
          displayName: "Name",
          dataType: "STRING",
        },
        budget: {
          apiName: "budget",
          displayName: "Budget",
          dataType: "DOUBLE",
        },
        headCount: {
          apiName: "headCount",
          displayName: "Head Count",
          dataType: "INTEGER",
        },
      },
    },
  );
  console.log(`✓ Created object type: Department`);

  // Create Project type
  await post(`/api/v2/ontologies/${ontology.rid}/objectTypes`, {
    apiName: "Project",
    displayName: "Project",
    description: "A project",
    primaryKey: "projectId",
    properties: {
      projectId: {
        apiName: "projectId",
        displayName: "Project ID",
        dataType: "STRING",
      },
      name: {
        apiName: "name",
        displayName: "Name",
        dataType: "STRING",
      },
      status: {
        apiName: "status",
        displayName: "Status",
        dataType: "STRING",
      },
      startDate: {
        apiName: "startDate",
        displayName: "Start Date",
        dataType: "DATETIME",
      },
      endDate: {
        apiName: "endDate",
        displayName: "End Date",
        dataType: "DATETIME",
      },
    },
  });
  console.log(`✓ Created object type: Project`);

  // 3. Create action types
  await post(`/api/v2/ontologies/${ontology.rid}/actionTypes`, {
    apiName: "createEmployee",
    displayName: "Create Employee",
    parameters: {
      firstName: {
        apiName: "firstName",
        displayName: "First Name",
        dataType: "STRING",
        required: true,
      },
      lastName: {
        apiName: "lastName",
        displayName: "Last Name",
        dataType: "STRING",
        required: true,
      },
      email: {
        apiName: "email",
        displayName: "Email",
        dataType: "STRING",
        required: true,
      },
      department: {
        apiName: "department",
        displayName: "Department",
        dataType: "STRING",
      },
    },
  });
  console.log(`✓ Created action type: createEmployee`);

  // 4. Create link types
  await post(`/api/v2/ontologies/${ontology.rid}/linkTypes`, {
    apiName: "employeeDepartment",
    displayName: "Employee → Department",
    objectTypeA: "Employee",
    objectTypeB: "Department",
    cardinality: "MANY_TO_ONE",
  });
  console.log(`✓ Created link type: employeeDepartment`);

  // 5. Create sample objects (50 employees, 5 departments, 10 projects)
  const departments = [
    "Engineering",
    "Product",
    "Design",
    "Marketing",
    "Sales",
  ];
  for (const dept of departments) {
    await post(`/api/v2/ontologies/${ontology.rid}/objects/Department`, {
      primaryKey: dept.toLowerCase(),
      properties: {
        departmentId: dept.toLowerCase(),
        name: dept,
        budget: Math.floor(Math.random() * 5000000) + 1000000,
        headCount: Math.floor(Math.random() * 50) + 10,
      },
    });
  }
  console.log(`✓ Created ${departments.length} departments`);

  const firstNames = [
    "Alice",
    "Bob",
    "Charlie",
    "Diana",
    "Eve",
    "Frank",
    "Grace",
    "Henry",
    "Iris",
    "Jack",
  ];
  const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
  ];
  for (let i = 0; i < 50; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
    await post(`/api/v2/ontologies/${ontology.rid}/objects/Employee`, {
      primaryKey: `emp-${String(i + 1).padStart(3, "0")}`,
      properties: {
        employeeId: `emp-${String(i + 1).padStart(3, "0")}`,
        firstName: fn,
        lastName: ln,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
        department: departments[i % departments.length],
        startDate: new Date(
          2020 + Math.floor(i / 12),
          i % 12,
          1,
        ).toISOString(),
        salary: 80000 + Math.floor(Math.random() * 70000),
      },
    });
  }
  console.log(`✓ Created 50 employees`);

  for (let i = 0; i < 10; i++) {
    await post(`/api/v2/ontologies/${ontology.rid}/objects/Project`, {
      primaryKey: `proj-${String(i + 1).padStart(3, "0")}`,
      properties: {
        projectId: `proj-${String(i + 1).padStart(3, "0")}`,
        name: `Project ${String.fromCharCode(65 + i)}`,
        status: ["ACTIVE", "PLANNING", "COMPLETED"][i % 3],
        startDate: new Date(2024, i, 1).toISOString(),
      },
    });
  }
  console.log(`✓ Created 10 projects`);

  // 6. Create sample datasets
  await post("/api/v2/datasets", {
    name: "employee-data",
    description: "Employee dataset",
  });
  await post("/api/v2/datasets", {
    name: "project-metrics",
    description: "Project metrics dataset",
  });
  console.log(`✓ Created 2 datasets`);

  // 7. Create sample users + groups
  const users = [
    {
      username: "admin",
      displayName: "Admin User",
      email: "admin@openfoundry.dev",
    },
    {
      username: "developer",
      displayName: "Dev User",
      email: "dev@openfoundry.dev",
    },
    {
      username: "analyst",
      displayName: "Analyst User",
      email: "analyst@openfoundry.dev",
    },
  ];
  for (const u of users) {
    await post("/api/v2/admin/users", u);
  }
  console.log(`✓ Created ${users.length} users`);

  await post("/api/v2/admin/groups", {
    name: "admins",
    description: "Platform administrators",
  });
  await post("/api/v2/admin/groups", {
    name: "developers",
    description: "Developers",
  });
  console.log(`✓ Created 2 groups`);

  // 8. Create sample functions
  await post("/api/v2/functions", {
    apiName: "calculateBonus",
    displayName: "Calculate Bonus",
    description: "Calculates employee bonus based on salary",
    code: "return { bonus: args.salary * 0.15 };",
    parameters: [{ name: "salary", type: "DOUBLE", required: true }],
    returnType: "OBJECT",
  });
  console.log(`✓ Created 1 function`);

  // -----------------------------------------------------------------------
  // 9. Pest control domain objects (for pipeline transforms)
  // -----------------------------------------------------------------------

  // Invoice objects
  const customers = ["CUST-001", "CUST-002", "CUST-003", "CUST-004", "CUST-005"];
  const invoiceStatuses = ["paid", "paid", "paid", "pending", "overdue"];
  for (let i = 0; i < 20; i++) {
    const custId = customers[i % customers.length];
    const status = invoiceStatuses[i % invoiceStatuses.length];
    await post(`/api/v2/ontologies/${ontology.rid}/objects/Invoice`, {
      primaryKey: `INV-${String(i + 1).padStart(4, "0")}`,
      properties: {
        invoiceId: `INV-${String(i + 1).padStart(4, "0")}`,
        customerId: custId,
        totalAmount: 150 + Math.floor(Math.random() * 850),
        status,
        serviceDate: new Date(2025, i % 12, 1 + (i % 28)).toISOString(),
        description: `Pest control service #${i + 1}`,
      },
    });
  }
  console.log(`✓ Created 20 Invoice objects`);

  // TreatmentProduct objects
  const products = [
    { name: "Termiticide Pro", stockQty: 12, minStockLevel: 20, unit: "liters", price: 89.99 },
    { name: "Rodent Bait Station", stockQty: 45, minStockLevel: 25, unit: "units", price: 34.50 },
    { name: "Insect Growth Regulator", stockQty: 5, minStockLevel: 15, unit: "liters", price: 125.00 },
    { name: "Pyrethrin Spray", stockQty: 8, minStockLevel: 10, unit: "cans", price: 42.00 },
    { name: "Ant Gel Bait", stockQty: 100, minStockLevel: 30, unit: "tubes", price: 18.75 },
    { name: "Mosquito Larvicide", stockQty: 3, minStockLevel: 12, unit: "kg", price: 67.00 },
    { name: "Cockroach Fogger", stockQty: 22, minStockLevel: 20, unit: "cans", price: 29.99 },
    { name: "Bed Bug Heat Treatment Kit", stockQty: 2, minStockLevel: 5, unit: "kits", price: 450.00 },
  ];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    await post(`/api/v2/ontologies/${ontology.rid}/objects/TreatmentProduct`, {
      primaryKey: `PROD-${String(i + 1).padStart(3, "0")}`,
      properties: {
        productId: `PROD-${String(i + 1).padStart(3, "0")}`,
        name: p.name,
        stockQty: p.stockQty,
        minStockLevel: p.minStockLevel,
        unit: p.unit,
        unitPrice: p.price,
      },
    });
  }
  console.log(`✓ Created ${products.length} TreatmentProduct objects`);

  // ServiceJob objects
  const technicians = ["TECH-001", "TECH-002", "TECH-003", "TECH-004"];
  const jobStatuses = ["completed", "completed", "in-progress", "scheduled"];
  for (let i = 0; i < 30; i++) {
    const techId = technicians[i % technicians.length];
    const status = jobStatuses[i % jobStatuses.length];
    await post(`/api/v2/ontologies/${ontology.rid}/objects/ServiceJob`, {
      primaryKey: `JOB-${String(i + 1).padStart(4, "0")}`,
      properties: {
        jobId: `JOB-${String(i + 1).padStart(4, "0")}`,
        technicianId: techId,
        customerId: customers[i % customers.length],
        status,
        serviceType: ["termite", "rodent", "general", "mosquito"][i % 4],
        scheduledDate: new Date(2025, i % 12, 1 + (i % 28)).toISOString(),
        durationHours: 1 + (i % 4),
      },
    });
  }
  console.log(`✓ Created 30 ServiceJob objects`);

  console.log("\n✅ Seed complete!");
}

// Helper
async function post(path: string, body: unknown) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 201) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
