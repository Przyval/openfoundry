import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { ObjectStore } from "../src/store/object-store.js";
import { LinkStore } from "../src/store/link-store.js";
import { setEnforcePermissions } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ONTOLOGY_RID = "ri.ontology.main.ontology.test-ontology";
const BASE_URL = `/api/v2/ontologies/${ONTOLOGY_RID}`;

/** Headers that grant full ADMIN access. */
const ADMIN_HEADERS = {
  "x-user-id": "test-admin",
  "x-user-roles": "ADMIN",
};

/** Headers that grant read-only VIEWER access. */
const VIEWER_HEADERS = {
  "x-user-id": "test-viewer",
  "x-user-roles": "VIEWER",
};

let app: FastifyInstance;
let store: ObjectStore;
let linkStore: LinkStore;

beforeEach(async () => {
  store = new ObjectStore();
  linkStore = new LinkStore();
  app = await createServer({
    config: { port: 0, host: "127.0.0.1", logLevel: "silent" },
    store,
    linkStore,
  });
});

function createEmployee(primaryKey: string, props: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `${BASE_URL}/objects/Employee`,
    payload: {
      primaryKey,
      properties: { name: `Employee ${primaryKey}`, department: "Engineering", salary: 100000, ...props },
    },
  });
}

// ===========================================================================
// Object CRUD
// ===========================================================================

describe("Object CRUD", () => {
  it("should create an object", async () => {
    const res = await createEmployee("emp-1");
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.objectType).toBe("Employee");
    expect(body.primaryKey).toBe("emp-1");
    expect(body.properties.name).toBe("Employee emp-1");
    expect(body.rid).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it("should get a single object", async () => {
    await createEmployee("emp-2");
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/emp-2`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().primaryKey).toBe("emp-2");
  });

  it("should list objects", async () => {
    await createEmployee("emp-a");
    await createEmployee("emp-b");
    await createEmployee("emp-c");

    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(3);
    expect(body.totalCount).toBe(3);
  });

  it("should update an object", async () => {
    await createEmployee("emp-u");
    const res = await app.inject({
      method: "PUT",
      url: `${BASE_URL}/objects/Employee/emp-u`,
      payload: { properties: { department: "Sales" } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.properties.department).toBe("Sales");
    // Name should still be there (merge, not replace)
    expect(body.properties.name).toBe("Employee emp-u");
  });

  it("should delete an object", async () => {
    await createEmployee("emp-d");
    const delRes = await app.inject({
      method: "DELETE",
      url: `${BASE_URL}/objects/Employee/emp-d`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/emp-d`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("should return 404 for non-existent object", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/does-not-exist`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorCode).toBe("NOT_FOUND");
  });

  it("should return 409 for duplicate primary key", async () => {
    await createEmployee("emp-dup");
    const res = await createEmployee("emp-dup");
    expect(res.statusCode).toBe(409);
    expect(res.json().errorCode).toBe("CONFLICT");
  });
});

// ===========================================================================
// Pagination
// ===========================================================================

describe("Pagination", () => {
  it("should paginate with pageSize", async () => {
    for (let i = 0; i < 5; i++) {
      await createEmployee(`page-${i}`);
    }

    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=2`,
    });
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.nextPageToken).toBeDefined();
    expect(body.totalCount).toBe(5);
  });

  it("should follow pageToken to next page", async () => {
    for (let i = 0; i < 5; i++) {
      await createEmployee(`pt-${i}`);
    }

    const page1 = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=3`,
    });
    const body1 = page1.json();
    expect(body1.data).toHaveLength(3);
    expect(body1.nextPageToken).toBeDefined();

    const page2 = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=3&pageToken=${body1.nextPageToken}`,
    });
    const body2 = page2.json();
    expect(body2.data).toHaveLength(2);
    expect(body2.nextPageToken).toBeUndefined();
  });
});

// ===========================================================================
// ObjectSet loadObjects
// ===========================================================================

describe("ObjectSet loadObjects", () => {
  beforeEach(async () => {
    await createEmployee("os-1", { name: "Alice", department: "Engineering", salary: 120000 });
    await createEmployee("os-2", { name: "Bob", department: "Sales", salary: 90000 });
    await createEmployee("os-3", { name: "Charlie", department: "Engineering", salary: 110000 });
    await createEmployee("os-4", { name: "Diana", department: "Marketing", salary: 95000 });
  });

  it("should load all objects with BASE set", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(4);
    expect(res.json().totalCount).toBe(4);
  });

  it("should filter with EQUALS", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "FILTER",
          objectSet: { type: "BASE", objectType: "Employee" },
          filter: { type: "EQUALS", property: "department", value: "Engineering" },
        },
      },
    });
    expect(res.json().data).toHaveLength(2);
  });

  it("should filter with CONTAINS", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "FILTER",
          objectSet: { type: "BASE", objectType: "Employee" },
          filter: { type: "CONTAINS", property: "name", value: "li" },
        },
      },
    });
    // Alice and Charlie both contain "li"
    expect(res.json().data).toHaveLength(2);
  });

  it("should filter with GT and LT", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "FILTER",
          objectSet: { type: "BASE", objectType: "Employee" },
          filter: {
            type: "AND",
            filters: [
              { type: "GT", property: "salary", value: 95000 },
              { type: "LT", property: "salary", value: 115000 },
            ],
          },
        },
      },
    });
    // Only Charlie (110000) matches > 95000 and < 115000
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].properties.name).toBe("Charlie");
  });

  it("should handle UNION", async () => {
    // Create a different object type
    await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Contractor`,
      payload: {
        primaryKey: "con-1",
        properties: { name: "Eve", department: "Engineering", salary: 80000 },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "UNION",
          objectSets: [
            { type: "BASE", objectType: "Employee" },
            { type: "BASE", objectType: "Contractor" },
          ],
        },
      },
    });
    expect(res.json().data).toHaveLength(5);
  });

  it("should handle INTERSECT", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "INTERSECT",
          objectSets: [
            {
              type: "FILTER",
              objectSet: { type: "BASE", objectType: "Employee" },
              filter: { type: "EQUALS", property: "department", value: "Engineering" },
            },
            {
              type: "FILTER",
              objectSet: { type: "BASE", objectType: "Employee" },
              filter: { type: "GT", property: "salary", value: 115000 },
            },
          ],
        },
      },
    });
    // Alice (Engineering, 120000) is in both sets
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].properties.name).toBe("Alice");
  });

  it("should handle SUBTRACT", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "SUBTRACT",
          objectSets: [
            { type: "BASE", objectType: "Employee" },
            {
              type: "FILTER",
              objectSet: { type: "BASE", objectType: "Employee" },
              filter: { type: "EQUALS", property: "department", value: "Engineering" },
            },
          ],
        },
      },
    });
    // All employees minus Engineering = Bob (Sales) + Diana (Marketing)
    expect(res.json().data).toHaveLength(2);
  });

  it("should paginate loadObjects results", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        pageSize: 2,
      },
    });
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.nextPageToken).toBeDefined();
    expect(body.totalCount).toBe(4);
  });

  it("should support orderBy", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        orderBy: [{ field: "salary", direction: "desc" }],
      },
    });
    const salaries = res.json().data.map((o: { properties: { salary: number } }) => o.properties.salary);
    expect(salaries).toEqual([120000, 110000, 95000, 90000]);
  });
});

// ===========================================================================
// Aggregations
// ===========================================================================

describe("Aggregations", () => {
  beforeEach(async () => {
    await createEmployee("agg-1", { name: "Alice", salary: 100 });
    await createEmployee("agg-2", { name: "Bob", salary: 200 });
    await createEmployee("agg-3", { name: "Charlie", salary: 300 });
  });

  it("should compute COUNT", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/aggregate`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        aggregation: [{ type: "COUNT" }],
      },
    });
    expect(res.json().data).toEqual([{ type: "COUNT", value: 3 }]);
  });

  it("should compute SUM", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/aggregate`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        aggregation: [{ type: "SUM", property: "salary" }],
      },
    });
    expect(res.json().data).toEqual([{ type: "SUM", property: "salary", value: 600 }]);
  });

  it("should compute AVG", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/aggregate`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        aggregation: [{ type: "AVG", property: "salary" }],
      },
    });
    expect(res.json().data).toEqual([{ type: "AVG", property: "salary", value: 200 }]);
  });

  it("should compute MIN", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/aggregate`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        aggregation: [{ type: "MIN", property: "salary" }],
      },
    });
    expect(res.json().data).toEqual([{ type: "MIN", property: "salary", value: 100 }]);
  });

  it("should compute MAX", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/aggregate`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        aggregation: [{ type: "MAX", property: "salary" }],
      },
    });
    expect(res.json().data).toEqual([{ type: "MAX", property: "salary", value: 300 }]);
  });

  it("should compute multiple aggregations at once", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/aggregate`,
      payload: {
        objectSet: { type: "BASE", objectType: "Employee" },
        aggregation: [
          { type: "COUNT" },
          { type: "SUM", property: "salary" },
          { type: "AVG", property: "salary" },
        ],
      },
    });
    const data = res.json().data;
    expect(data).toHaveLength(3);
    expect(data[0].value).toBe(3);
    expect(data[1].value).toBe(600);
    expect(data[2].value).toBe(200);
  });
});

// ===========================================================================
// Links
// ===========================================================================

describe("Links", () => {
  beforeEach(async () => {
    await createEmployee("link-mgr");
    await createEmployee("link-report-1");
    await createEmployee("link-report-2");
  });

  it("should create a link", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages`,
      payload: {
        targetObjectType: "Employee",
        targetPrimaryKey: "link-report-1",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().linkType).toBe("manages");
    expect(res.json().targetPrimaryKey).toBe("link-report-1");
  });

  it("should list linked objects", async () => {
    // Create two links
    await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages`,
      payload: { targetObjectType: "Employee", targetPrimaryKey: "link-report-1" },
    });
    await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages`,
      payload: { targetObjectType: "Employee", targetPrimaryKey: "link-report-2" },
    });

    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
    expect(res.json().totalCount).toBe(2);
  });

  it("should delete a link", async () => {
    await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages`,
      payload: { targetObjectType: "Employee", targetPrimaryKey: "link-report-1" },
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages/link-report-1`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages`,
    });
    expect(getRes.json().data).toHaveLength(0);
  });

  it("should return 404 when deleting non-existent link", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `${BASE_URL}/objects/Employee/link-mgr/links/manages/no-such-target`,
    });
    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// Health endpoints
// ===========================================================================

describe("Health endpoints", () => {
  it("should return HEALTHY on /status/health", async () => {
    const res = await app.inject({ method: "GET", url: "/status/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("HEALTHY");
  });

  it("should return HEALTHY on /status/liveness", async () => {
    const res = await app.inject({ method: "GET", url: "/status/liveness" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("HEALTHY");
  });

  it("should return HEALTHY on /status/readiness", async () => {
    const res = await app.inject({ method: "GET", url: "/status/readiness" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("HEALTHY");
  });
});

// ===========================================================================
// Permission enforcement
// ===========================================================================

describe("Permission enforcement", () => {
  beforeEach(() => {
    setEnforcePermissions(true);
  });

  afterEach(() => {
    setEnforcePermissions(false);
  });

  it("allows ADMIN to create an object", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee`,
      headers: ADMIN_HEADERS,
      payload: {
        primaryKey: "perm-1",
        properties: { name: "Perm Test" },
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("allows VIEWER to read objects", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee`,
      headers: VIEWER_HEADERS,
    });
    expect(res.statusCode).toBe(200);
  });

  it("denies VIEWER from creating an object", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee`,
      headers: VIEWER_HEADERS,
      payload: {
        primaryKey: "denied",
        properties: { name: "Denied" },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies VIEWER from deleting an object", async () => {
    // Create with admin
    await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee`,
      headers: ADMIN_HEADERS,
      payload: {
        primaryKey: "del-perm",
        properties: { name: "Delete Perm" },
      },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `${BASE_URL}/objects/Employee/del-perm`,
      headers: VIEWER_HEADERS,
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies requests with no identity when enforcement is enabled", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee`,
    });
    expect(res.statusCode).toBe(403);
  });
});
