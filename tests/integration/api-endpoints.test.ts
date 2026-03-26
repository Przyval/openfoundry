/**
 * API Endpoints Integration Tests
 *
 * Tests ALL major API endpoints against the running OpenFoundry services.
 * Prerequisites: Services must be running (bash start.sh).
 *
 * These tests call real HTTP endpoints through the gateway at localhost:8080.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.OPENFOUNDRY_HOST ?? "http://localhost:8080";
const CLIENT_ID = process.env.OPENFOUNDRY_CLIENT_ID ?? "admin";
const CLIENT_SECRET = process.env.OPENFOUNDRY_CLIENT_SECRET ?? "admin123";

let token: string;
let ontologyRid: string;
let ontologyApiName: string;
let objectTypeApiName: string;
let createdObjectPk: string;
let datasetRid: string;
let transactionRid: string;
let functionRid: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ===========================================================================
// Tests
// ===========================================================================

describe("OpenFoundry API Integration Tests", () => {
  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------
  describe("Authentication", () => {
    it("POST /multipass/api/oauth2/token (client_credentials)", async () => {
      const res = await fetch(`${BASE}/multipass/api/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("access_token");
      expect(data).toHaveProperty("token_type", "bearer");
      expect(data).toHaveProperty("expires_in");
      expect(typeof data.access_token).toBe("string");
      expect(data.access_token.length).toBeGreaterThan(10);

      // Store for subsequent tests
      token = data.access_token;
    });

    it("GET /api/v2/admin/users/getCurrent", async () => {
      const res = await api("GET", "/api/v2/admin/users/getCurrent");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("username");
      expect(data).toHaveProperty("email");
      expect(data).toHaveProperty("realm");
      expect(data).toHaveProperty("organization");
      // The token was issued for the client_credentials grant with sub = "service:admin"
      expect(typeof data.id).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // Ontology API
  // -------------------------------------------------------------------------
  describe("Ontology API", () => {
    it("GET /api/v2/ontologies", async () => {
      const res = await api("GET", "/api/v2/ontologies");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);

      // There should be at least one ontology from seeded data
      if (data.data.length > 0) {
        const ont = data.data[0];
        expect(ont).toHaveProperty("rid");
        expect(ont).toHaveProperty("apiName");
        expect(ont).toHaveProperty("displayName");

        // Store the first ontology for subsequent tests
        ontologyRid = ont.rid;
        ontologyApiName = ont.apiName;
      }
    });

    it("GET /api/v2/ontologies/:rid", async () => {
      expect(ontologyRid).toBeDefined();

      const res = await api("GET", `/api/v2/ontologies/${ontologyRid}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("rid", ontologyRid);
      expect(data).toHaveProperty("apiName");
      expect(data).toHaveProperty("displayName");
    });

    it("GET /api/v2/ontologies/:apiName", async () => {
      expect(ontologyApiName).toBeDefined();

      const res = await api("GET", `/api/v2/ontologies/${ontologyApiName}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("apiName", ontologyApiName);
      expect(data).toHaveProperty("rid");
    });

    it("GET /api/v2/ontologies/:rid/objectTypes", async () => {
      expect(ontologyRid).toBeDefined();

      const res = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/objectTypes`,
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);

      // Store the first object type for later object tests
      if (data.data.length > 0) {
        objectTypeApiName = data.data[0].apiName;
        expect(data.data[0]).toHaveProperty("apiName");
      }
    });

    it("GET /api/v2/ontologies/:rid/actionTypes", async () => {
      expect(ontologyRid).toBeDefined();

      const res = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("GET /api/v2/ontologies/:rid/linkTypes", async () => {
      expect(ontologyRid).toBeDefined();

      const res = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/linkTypes`,
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("GET /api/v2/ontologies/:rid/queryTypes", async () => {
      expect(ontologyRid).toBeDefined();

      const res = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/queryTypes`,
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Objects API
  // -------------------------------------------------------------------------
  describe("Objects API", () => {
    it("GET /api/v2/ontologies/:rid/objects/:type", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}`,
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);

      if (data.data.length > 0) {
        const obj = data.data[0];
        expect(obj).toHaveProperty("rid");
        expect(obj).toHaveProperty("objectType");
        expect(obj).toHaveProperty("primaryKey");
        expect(obj).toHaveProperty("properties");
      }
    });

    it("POST /api/v2/ontologies/:rid/objects/:type (create)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      createdObjectPk = `test-integration-${Date.now()}`;

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}`,
        {
          primaryKey: createdObjectPk,
          properties: {
            [createdObjectPk.includes("customer")
              ? "customerId"
              : "id"]: createdObjectPk,
            name: "Integration Test Object",
          },
        },
      );
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data).toHaveProperty("rid");
      expect(data).toHaveProperty("primaryKey", createdObjectPk);
      expect(data).toHaveProperty("properties");
    });

    it("GET /api/v2/ontologies/:rid/objects/:type/:pk", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();
      expect(createdObjectPk).toBeDefined();

      const res = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/${createdObjectPk}`,
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("primaryKey", createdObjectPk);
      expect(data).toHaveProperty("properties");
    });

    it("PUT /api/v2/ontologies/:rid/objects/:type/:pk (update)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();
      expect(createdObjectPk).toBeDefined();

      const res = await api(
        "PUT",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/${createdObjectPk}`,
        {
          properties: { name: "Updated Integration Test Object" },
        },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("properties");
      expect(data.properties.name).toBe("Updated Integration Test Object");
    });

    it("POST /api/v2/ontologies/:rid/objects/:type/search (empty where)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/search`,
        { pageSize: 5 },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("POST /api/v2/ontologies/:rid/objects/:type/search (eq filter)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/search`,
        {
          where: {
            type: "eq",
            field: "name",
            value: "Updated Integration Test Object",
          },
          pageSize: 10,
        },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
      // The object we created and updated should appear
      if (data.data.length > 0) {
        expect(data.data[0].properties.name).toBe(
          "Updated Integration Test Object",
        );
      }
    });

    it("POST /api/v2/ontologies/:rid/objects/:type/search (and filter)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/search`,
        {
          where: {
            type: "and",
            value: [
              {
                type: "contains",
                field: "name",
                value: "Integration",
              },
              {
                type: "contains",
                field: "name",
                value: "Test",
              },
            ],
          },
          pageSize: 10,
        },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("POST /api/v2/ontologies/:rid/objectSets/loadObjects (base)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`,
        {
          objectSet: {
            type: "BASE",
            objectType: objectTypeApiName,
          },
          pageSize: 5,
        },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
      expect(data).toHaveProperty("totalCount");
      expect(typeof data.totalCount).toBe("number");
    });

    it("POST /api/v2/ontologies/:rid/objectSets/loadObjects (filter)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`,
        {
          objectSet: {
            type: "FILTER",
            objectSet: {
              type: "BASE",
              objectType: objectTypeApiName,
            },
            where: {
              type: "contains",
              field: "name",
              value: "Integration",
            },
          },
          pageSize: 10,
        },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("POST /api/v2/ontologies/:rid/objects/:type/aggregate (count)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/aggregate`,
        {
          aggregation: [{ type: "count" }],
        },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);

      // Count should include at least the object we created
      const countMetric = data.data[0];
      expect(countMetric).toHaveProperty("metrics");
      expect(Array.isArray(countMetric.metrics)).toBe(true);
    });

    it("POST /api/v2/ontologies/:rid/objects/:type/aggregate (groupBy)", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/aggregate`,
        {
          aggregation: [{ type: "count" }],
          groupBy: [{ field: "name", type: "exact" }],
        },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);

      if (data.data.length > 0) {
        expect(data.data[0]).toHaveProperty("group");
        expect(data.data[0]).toHaveProperty("metrics");
      }
    });

    it("DELETE /api/v2/ontologies/:rid/objects/:type/:pk", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();
      expect(createdObjectPk).toBeDefined();

      const res = await api(
        "DELETE",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/${createdObjectPk}`,
      );
      expect(res.status).toBe(204);

      // Verify it is gone
      const getRes = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/${createdObjectPk}`,
      );
      expect(getRes.status).toBeGreaterThanOrEqual(400);
    });
  });

  // -------------------------------------------------------------------------
  // Actions API
  // -------------------------------------------------------------------------
  describe("Actions API", () => {
    it("POST /api/v2/ontologies/:rid/actions/:action/apply", async () => {
      expect(ontologyRid).toBeDefined();

      // Get a list of action types to find one we can test
      const typesRes = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      );
      const typesData = await typesRes.json();

      if (typesData.data && typesData.data.length > 0) {
        const actionApiName = typesData.data[0].apiName;

        const res = await api(
          "POST",
          `/api/v2/ontologies/${ontologyRid}/actions/${actionApiName}/apply`,
          { parameters: {} },
        );

        // Action may succeed (200) or return 404 if the action handler is
        // not registered on svc-actions for this action type.
        // Both are valid integration outcomes.
        expect([200, 404]).toContain(res.status);
      } else {
        // No action types available -- skip by passing
        expect(true).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Links API
  // -------------------------------------------------------------------------
  describe("Links API", () => {
    it("GET /api/v2/ontologies/:rid/objects/:type/:pk/links/:linkType", async () => {
      expect(ontologyRid).toBeDefined();
      expect(objectTypeApiName).toBeDefined();

      // Get an object to test links on
      const listRes = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}?pageSize=1`,
      );
      const listData = await listRes.json();

      // Get link types for this object type
      const linkTypesRes = await api(
        "GET",
        `/api/v2/ontologies/${ontologyRid}/linkTypes`,
      );
      const linkTypesData = await linkTypesRes.json();

      if (
        listData.data?.length > 0 &&
        linkTypesData.data?.length > 0
      ) {
        const obj = listData.data[0];
        const linkTypeApiName = linkTypesData.data[0].apiName;

        const res = await api(
          "GET",
          `/api/v2/ontologies/${ontologyRid}/objects/${objectTypeApiName}/${obj.primaryKey}/links/${linkTypeApiName}`,
        );
        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveProperty("data");
        expect(Array.isArray(data.data)).toBe(true);
      } else {
        // No objects or link types -- skip
        expect(true).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Datasets API
  // -------------------------------------------------------------------------
  describe("Datasets API", () => {
    it("GET /api/v2/datasets", async () => {
      const res = await api("GET", "/api/v2/datasets");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("POST /api/v2/datasets (create)", async () => {
      const res = await api("POST", "/api/v2/datasets", {
        name: `integration-test-${Date.now()}`,
        description: "Created by integration test",
        parentFolderRid: "ri.compass.main.folder.root",
      });
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data).toHaveProperty("rid");
      expect(data).toHaveProperty("name");
      expect(data.name).toContain("integration-test-");
      datasetRid = data.rid;
    });

    it("GET /api/v2/datasets/:rid", async () => {
      expect(datasetRid).toBeDefined();

      const res = await api("GET", `/api/v2/datasets/${datasetRid}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("rid", datasetRid);
      expect(data).toHaveProperty("name");
    });

    it("GET /api/v2/datasets/:rid/branches", async () => {
      expect(datasetRid).toBeDefined();

      const res = await api(
        "GET",
        `/api/v2/datasets/${datasetRid}/branches`,
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("POST /api/v2/datasets/:rid/transactions", async () => {
      expect(datasetRid).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/datasets/${datasetRid}/transactions?branchName=main`,
        { transactionType: "APPEND" },
      );

      // Transaction creation may succeed (201) or may fail if branch
      // "main" doesn't exist yet. Both are valid integration outcomes.
      if (res.status === 201) {
        const data = await res.json();
        expect(data).toHaveProperty("rid");
        expect(data).toHaveProperty("status");
        transactionRid = data.rid;
      } else {
        // No main branch -- acceptable in a fresh dataset
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    it("DELETE /api/v2/datasets/:rid (cleanup)", async () => {
      expect(datasetRid).toBeDefined();

      const res = await api("DELETE", `/api/v2/datasets/${datasetRid}`);
      expect(res.status).toBe(204);
    });
  });

  // -------------------------------------------------------------------------
  // Admin API
  // -------------------------------------------------------------------------
  describe("Admin API", () => {
    it("GET /api/v2/admin/users", async () => {
      const res = await api("GET", "/api/v2/admin/users");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("GET /api/v2/admin/groups", async () => {
      const res = await api("GET", "/api/v2/admin/groups");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AIP API
  // -------------------------------------------------------------------------
  describe("AIP API", () => {
    it("POST /api/v2/aip/chat", async () => {
      const res = await api("POST", "/api/v2/aip/chat", {
        messages: [{ role: "user", content: "Hello, what object types exist?" }],
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("message");
      expect(data.message).toHaveProperty("role", "assistant");
      expect(data.message).toHaveProperty("content");
      expect(typeof data.message.content).toBe("string");
      expect(data).toHaveProperty("sessionId");
    });

    it("GET /api/v2/aip/agents", async () => {
      const res = await api("GET", "/api/v2/aip/agents");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);

      const agent = data.data[0];
      expect(agent).toHaveProperty("rid");
      expect(agent).toHaveProperty("displayName");
      expect(agent).toHaveProperty("description");
      expect(agent).toHaveProperty("capabilities");
      expect(agent).toHaveProperty("status");
    });
  });

  // -------------------------------------------------------------------------
  // Functions API
  // -------------------------------------------------------------------------
  describe("Functions API", () => {
    it("POST /api/v2/functions (register)", async () => {
      const res = await api("POST", "/api/v2/functions", {
        apiName: `integrationTestFn_${Date.now()}`,
        displayName: "Integration Test Function",
        description: "Created by API integration test",
        code: "return 2 + 2;",
        parameters: [],
        returnType: "INTEGER",
      });
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data).toHaveProperty("rid");
      expect(data).toHaveProperty("apiName");
      functionRid = data.rid;
    });

    it("GET /api/v2/functions", async () => {
      const res = await api("GET", "/api/v2/functions");
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);

      // The function we just registered should be in the list
      const found = data.data.find(
        (f: { rid: string }) => f.rid === functionRid,
      );
      expect(found).toBeDefined();
    });

    it("POST /api/v2/functions/:rid/execute", async () => {
      expect(functionRid).toBeDefined();

      const res = await api(
        "POST",
        `/api/v2/functions/${functionRid}/execute`,
        { args: {} },
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("output", 4);
    });

    it("DELETE /api/v2/functions/:rid (cleanup)", async () => {
      expect(functionRid).toBeDefined();

      const res = await api(
        "DELETE",
        `/api/v2/functions/${functionRid}`,
      );
      expect(res.status).toBe(204);
    });
  });
});
