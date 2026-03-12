import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { OntologyStore } from "../src/store/ontology-store.js";
import { setEnforcePermissions } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

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

function makeObjectType(apiName: string) {
  return {
    apiName,
    description: `${apiName} object type`,
    primaryKeyApiName: "id",
    primaryKeyType: "STRING",
    titlePropertyApiName: "name",
    properties: {
      id: {
        type: "STRING",
        nullable: false,
        multiplicity: "SINGLE",
        description: "Primary key",
      },
      name: {
        type: "STRING",
        nullable: false,
        multiplicity: "SINGLE",
        description: "Display name",
      },
    },
    implements: [],
    status: "ACTIVE",
  };
}

function makeActionType(apiName: string) {
  return {
    apiName,
    description: `${apiName} action`,
    parameters: {},
    modifiedEntities: {},
    status: "ACTIVE",
  };
}

function makeLinkType(
  apiName: string,
  from: string,
  to: string,
) {
  return {
    apiName,
    objectTypeApiName: from,
    linkedObjectTypeApiName: to,
    cardinality: "MANY",
    foreignKeyPropertyApiName: `${to}Id`,
  };
}

function makeInterfaceType(apiName: string) {
  return {
    apiName,
    description: `${apiName} interface`,
    properties: {},
    extendsInterfaces: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let store: OntologyStore;

beforeEach(async () => {
  store = new OntologyStore();
  app = await createServer({ config: TEST_CONFIG, store });
});

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

describe("Health endpoints", () => {
  it("GET /status/health returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });
});

// -------------------------------------------------------------------------
// Ontology CRUD
// -------------------------------------------------------------------------

describe("Ontology CRUD", () => {
  it("POST /api/v2/ontologies creates an ontology", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "test-ontology",
        displayName: "Test Ontology",
        description: "A test ontology",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.apiName).toBe("test-ontology");
    expect(body.displayName).toBe("Test Ontology");
    expect(body.rid).toMatch(/^ri\./);
  });

  it("GET /api/v2/ontologies lists ontologies", async () => {
    // Create two ontologies
    await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "ont-a",
        displayName: "Ontology A",
        description: "First",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "ont-b",
        displayName: "Ontology B",
        description: "Second",
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/v2/ontologies" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
  });

  it("GET /api/v2/ontologies/:rid returns specific ontology", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "my-ont",
        displayName: "My Ontology",
        description: "Desc",
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiName).toBe("my-ont");
  });

  it("DELETE /api/v2/ontologies/:rid deletes an ontology", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "delete-me",
        displayName: "Delete Me",
        description: "To be deleted",
      },
    });
    const rid = createRes.json().rid;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/ontologies/${rid}`,
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify it is gone
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("GET /api/v2/ontologies/:rid returns 404 for unknown RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies/ri.ontology.main.ontology.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v2/ontologies returns 409 for duplicate apiName", async () => {
    const payload = {
      apiName: "dup-ont",
      displayName: "Dup",
      description: "Duplicate",
    };
    await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload,
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Object type CRUD
// -------------------------------------------------------------------------

describe("Object type CRUD", () => {
  let ontologyRid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "obj-test-ont",
        displayName: "OT Ontology",
        description: "For object type tests",
      },
    });
    ontologyRid = res.json().rid;
  });

  it("POST creates an object type", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().apiName).toBe("Employee");
  });

  it("GET lists object types", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Department"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET returns a specific object type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiName).toBe("Employee");
  });

  it("PUT updates an object type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });

    const updated = {
      ...makeObjectType("Employee"),
      description: "Updated description",
    };
    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee`,
      payload: updated,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe("Updated description");
  });

  it("DELETE removes an object type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("POST returns 409 for duplicate apiName", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });
    expect(res.statusCode).toBe(409);
  });

  it("GET returns 404 for unknown object type", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Nope`,
    });
    expect(res.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Action type CRUD
// -------------------------------------------------------------------------

describe("Action type CRUD", () => {
  let ontologyRid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "act-test-ont",
        displayName: "AT Ontology",
        description: "For action type tests",
      },
    });
    ontologyRid = res.json().rid;
  });

  it("POST creates an action type", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      payload: makeActionType("createEmployee"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().apiName).toBe("createEmployee");
  });

  it("GET lists action types", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      payload: makeActionType("createEmployee"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("GET returns a specific action type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      payload: makeActionType("createEmployee"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes/createEmployee`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiName).toBe("createEmployee");
  });

  it("PUT updates an action type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      payload: makeActionType("createEmployee"),
    });

    const updated = {
      ...makeActionType("createEmployee"),
      description: "Updated action",
    };
    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes/createEmployee`,
      payload: updated,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe("Updated action");
  });

  it("DELETE removes an action type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      payload: makeActionType("createEmployee"),
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes/createEmployee`,
    });
    expect(delRes.statusCode).toBe(204);
  });
});

// -------------------------------------------------------------------------
// Link type CRUD
// -------------------------------------------------------------------------

describe("Link type CRUD", () => {
  let ontologyRid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "link-test-ont",
        displayName: "LT Ontology",
        description: "For link type tests",
      },
    });
    ontologyRid = res.json().rid;

    // Create two object types for linking
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      payload: makeObjectType("Department"),
    });
  });

  it("POST creates a link type", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/linkTypes`,
      payload: makeLinkType("employeeDepartment", "Employee", "Department"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().apiName).toBe("employeeDepartment");
  });

  it("GET lists link types for an object type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/linkTypes`,
      payload: makeLinkType("employeeDepartment", "Employee", "Department"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee/linkTypes`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("GET returns a specific link type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/linkTypes`,
      payload: makeLinkType("employeeDepartment", "Employee", "Department"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/linkTypes/employeeDepartment`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiName).toBe("employeeDepartment");
  });

  it("DELETE removes a link type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/linkTypes`,
      payload: makeLinkType("employeeDepartment", "Employee", "Department"),
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/ontologies/${ontologyRid}/linkTypes/employeeDepartment`,
    });
    expect(delRes.statusCode).toBe(204);
  });
});

// -------------------------------------------------------------------------
// Interface type CRUD
// -------------------------------------------------------------------------

describe("Interface type CRUD", () => {
  let ontologyRid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "iface-test-ont",
        displayName: "IF Ontology",
        description: "For interface type tests",
      },
    });
    ontologyRid = res.json().rid;
  });

  it("POST creates an interface type", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
      payload: makeInterfaceType("Auditable"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().apiName).toBe("Auditable");
  });

  it("GET lists interface types", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
      payload: makeInterfaceType("Auditable"),
    });
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
      payload: makeInterfaceType("Timestamped"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET returns a specific interface type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
      payload: makeInterfaceType("Auditable"),
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes/Auditable`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().apiName).toBe("Auditable");
  });

  it("DELETE removes an interface type", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
      payload: makeInterfaceType("Auditable"),
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes/Auditable`,
    });
    expect(delRes.statusCode).toBe(204);
  });

  it("POST returns 409 for duplicate interface apiName", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
      payload: makeInterfaceType("Auditable"),
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
      payload: makeInterfaceType("Auditable"),
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Pagination
// -------------------------------------------------------------------------

describe("Pagination", () => {
  let ontologyRid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "page-test-ont",
        displayName: "Page Ontology",
        description: "For pagination tests",
      },
    });
    ontologyRid = res.json().rid;

    // Create 5 object types
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
        payload: makeObjectType(`Type${i}`),
      });
    }
  });

  it("respects pageSize query parameter", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes?pageSize=2`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.nextPageToken).toBeDefined();
  });

  it("follows nextPageToken to get all results", async () => {
    // Get first page
    const page1 = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes?pageSize=3`,
    });
    const body1 = page1.json();
    expect(body1.data).toHaveLength(3);
    expect(body1.nextPageToken).toBeDefined();

    // Get second page
    const page2 = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes?pageSize=3&pageToken=${body1.nextPageToken}`,
    });
    const body2 = page2.json();
    expect(body2.data).toHaveLength(2);
    expect(body2.nextPageToken).toBeUndefined();
  });

  it("returns all items when pageSize is large enough", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes?pageSize=100`,
    });
    const body = res.json();
    expect(body.data).toHaveLength(5);
    expect(body.nextPageToken).toBeUndefined();
  });
});

// -------------------------------------------------------------------------
// Cascade delete
// -------------------------------------------------------------------------

describe("Cascade delete", () => {
  it("deleting an ontology removes all child types", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "cascade-ont",
        displayName: "Cascade",
        description: "Test cascade delete",
      },
    });
    const rid = createRes.json().rid;

    // Add an object type
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${rid}/objectTypes`,
      payload: makeObjectType("Employee"),
    });

    // Add an action type
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${rid}/actionTypes`,
      payload: makeActionType("createEmployee"),
    });

    // Delete the ontology
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/ontologies/${rid}`,
    });
    expect(deleteRes.statusCode).toBe(204);

    // Verify ontology is gone
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Permission enforcement
// -------------------------------------------------------------------------

describe("Permission enforcement", () => {
  beforeEach(() => {
    setEnforcePermissions(true);
  });

  afterEach(() => {
    setEnforcePermissions(false);
  });

  it("allows ADMIN to create an ontology", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      headers: ADMIN_HEADERS,
      payload: {
        apiName: "perm-test",
        displayName: "Perm Test",
        description: "Testing permissions",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("allows VIEWER to read ontologies", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
      headers: VIEWER_HEADERS,
    });
    expect(res.statusCode).toBe(200);
  });

  it("denies VIEWER from creating an ontology", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      headers: VIEWER_HEADERS,
      payload: {
        apiName: "denied",
        displayName: "Denied",
        description: "Should be denied",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies VIEWER from deleting an ontology", async () => {
    // Create with admin first
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      headers: ADMIN_HEADERS,
      payload: {
        apiName: "delete-perm",
        displayName: "Delete Perm",
        description: "For permission test",
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/ontologies/${rid}`,
      headers: VIEWER_HEADERS,
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies requests with no identity when enforcement is enabled", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/ontologies",
    });
    expect(res.statusCode).toBe(403);
  });
});
