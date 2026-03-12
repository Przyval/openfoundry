import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFoundryClient, FoundryClient } from "../src/index.js";
import type {
  Ontology,
  ObjectType,
  OntologyObject,
  ActionResult,
  ValidationResult,
  BatchResult,
  Dataset,
  User,
  Group,
  AggregationResponse,
} from "../src/index.js";
import type { PageResponse } from "@openfoundry/pagination";
import { BearerToken } from "@openfoundry/auth-tokens";

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function createMockFetch(responseBody: unknown, status = 200) {
  const body = status === 204 ? null : JSON.stringify(responseBody);
  return vi.fn().mockResolvedValue(
    new Response(body, {
      status,
      headers: body ? { "Content-Type": "application/json" } : {},
    }),
  );
}

// ---------------------------------------------------------------------------
// Client creation
// ---------------------------------------------------------------------------

describe("createFoundryClient", () => {
  it("should create a client with a static token string", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
    });
    expect(client).toBeInstanceOf(FoundryClient);
  });

  it("should create a client with a tokenProvider function", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      tokenProvider: () => new BearerToken("test-token-123"),
    });
    expect(client).toBeInstanceOf(FoundryClient);
  });

  it("should throw if neither token nor tokenProvider is provided", () => {
    expect(() =>
      createFoundryClient({
        baseUrl: "https://example.openfoundry.com",
      }),
    ).toThrow(/tokenProvider.*token/);
  });

  it("should accept a custom fetchFn", () => {
    const customFetch = vi.fn();
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: customFetch,
    });
    expect(client).toBeInstanceOf(FoundryClient);
  });

  it("should prefer tokenProvider over static token when both provided", () => {
    const provider = vi.fn().mockReturnValue(new BearerToken("provider-token"));
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "static-token",
      tokenProvider: provider,
    });
    expect(client).toBeInstanceOf(FoundryClient);
  });
});

// ---------------------------------------------------------------------------
// Lazy API namespace creation
// ---------------------------------------------------------------------------

describe("FoundryClient API namespaces", () => {
  it("should lazily create and cache the ontologies namespace", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
    });
    const first = client.ontologies;
    const second = client.ontologies;
    expect(first).toBe(second);
  });

  it("should lazily create and cache the objects namespace", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
    });
    const first = client.objects;
    const second = client.objects;
    expect(first).toBe(second);
  });

  it("should lazily create and cache the actions namespace", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
    });
    const first = client.actions;
    const second = client.actions;
    expect(first).toBe(second);
  });

  it("should lazily create and cache the datasets namespace", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
    });
    const first = client.datasets;
    const second = client.datasets;
    expect(first).toBe(second);
  });

  it("should lazily create and cache the admin namespace", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
    });
    const first = client.admin;
    const second = client.admin;
    expect(first).toBe(second);
  });

  it("should lazily create and cache all namespaces independently", () => {
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
    });
    expect(client.ontologies).toBeDefined();
    expect(client.objects).toBeDefined();
    expect(client.actions).toBeDefined();
    expect(client.datasets).toBeDefined();
    expect(client.admin).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// OntologiesApi
// ---------------------------------------------------------------------------

describe("OntologiesApi", () => {
  const ontologyResponse: PageResponse<Ontology> = {
    data: [
      { rid: "ri.ontology.1", apiName: "myOntology", displayName: "My Ontology", description: "Test" },
    ],
  };

  it("should call listOntologies and return paginated results", async () => {
    const mockFetch = createMockFetch(ontologyResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.ontologies.listOntologies();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].apiName).toBe("myOntology");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies");
  });

  it("should call getOntology with the correct path", async () => {
    const singleOntology: Ontology = {
      rid: "ri.ontology.1",
      apiName: "myOntology",
      displayName: "My Ontology",
      description: "Test",
    };
    const mockFetch = createMockFetch(singleOntology);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.ontologies.getOntology("ri.ontology.1");
    expect(result.apiName).toBe("myOntology");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1");
  });

  it("should call listObjectTypes with pagination params", async () => {
    const objectTypesResponse: PageResponse<ObjectType> = {
      data: [
        {
          apiName: "Employee",
          description: "An employee",
          primaryKeyApiName: "id",
          primaryKeyType: "STRING",
          titlePropertyApiName: "name",
          properties: {},
          status: "ACTIVE",
        },
      ],
    };
    const mockFetch = createMockFetch(objectTypesResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.ontologies.listObjectTypes("ri.ontology.1", {
      pageSize: 10,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].apiName).toBe("Employee");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objectTypes");
    expect(url).toContain("pageSize=10");
  });

  it("should call getObjectType with the correct path", async () => {
    const objectType: ObjectType = {
      apiName: "Employee",
      description: "An employee",
      primaryKeyApiName: "id",
      primaryKeyType: "STRING",
      titlePropertyApiName: "name",
      properties: {},
      status: "ACTIVE",
    };
    const mockFetch = createMockFetch(objectType);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.ontologies.getObjectType("ri.ontology.1", "Employee");
    expect(result.apiName).toBe("Employee");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objectTypes/Employee");
  });

  it("should call listActionTypes with the correct path", async () => {
    const actionTypesResponse = { data: [] };
    const mockFetch = createMockFetch(actionTypesResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.ontologies.listActionTypes("ri.ontology.1");
    expect(result.data).toHaveLength(0);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/actionTypes");
  });

  it("should call listLinkTypes with the correct path", async () => {
    const linkTypesResponse = { data: [] };
    const mockFetch = createMockFetch(linkTypesResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.ontologies.listLinkTypes("ri.ontology.1", "Employee");
    expect(result.data).toHaveLength(0);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objectTypes/Employee/linkTypes");
  });

  it("should call listInterfaceTypes with the correct path", async () => {
    const interfaceTypesResponse = { data: [] };
    const mockFetch = createMockFetch(interfaceTypesResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.ontologies.listInterfaceTypes("ri.ontology.1");
    expect(result.data).toHaveLength(0);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/interfaceTypes");
  });

  it("should pass pageToken as a query parameter", async () => {
    const mockFetch = createMockFetch({ data: [] });
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await client.ontologies.listOntologies({ pageToken: "next-page-abc" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("pageToken=next-page-abc");
  });
});

// ---------------------------------------------------------------------------
// ObjectsApi
// ---------------------------------------------------------------------------

describe("ObjectsApi", () => {
  it("should call getObject with the correct path", async () => {
    const obj: OntologyObject = {
      __apiName: "Employee",
      __primaryKey: "emp-1",
      name: "Alice",
    };
    const mockFetch = createMockFetch(obj);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.objects.getObject("ri.ontology.1", "Employee", "emp-1");
    expect(result.__apiName).toBe("Employee");
    expect(result.name).toBe("Alice");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objects/Employee/emp-1");
  });

  it("should call listObjects with the correct path", async () => {
    const listResponse: PageResponse<OntologyObject> = {
      data: [
        { __apiName: "Employee", __primaryKey: "emp-1", name: "Alice" },
      ],
    };
    const mockFetch = createMockFetch(listResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.objects.listObjects("ri.ontology.1", "Employee");
    expect(result.data).toHaveLength(1);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objects/Employee");
  });

  it("should call createObject with a POST body", async () => {
    const created: OntologyObject = {
      __apiName: "Employee",
      __primaryKey: "emp-2",
      name: "Bob",
    };
    const mockFetch = createMockFetch(created);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.objects.createObject("ri.ontology.1", "Employee", {
      name: "Bob",
    });
    expect(result.__primaryKey).toBe("emp-2");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objects/Employee");
    expect(init.method).toBe("POST");
  });

  it("should call updateObject with a PUT method", async () => {
    const updated: OntologyObject = {
      __apiName: "Employee",
      __primaryKey: "emp-1",
      name: "Alice Updated",
    };
    const mockFetch = createMockFetch(updated);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.objects.updateObject("ri.ontology.1", "Employee", "emp-1", {
      name: "Alice Updated",
    });
    expect(result.name).toBe("Alice Updated");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objects/Employee/emp-1");
    expect(init.method).toBe("PUT");
  });

  it("should call deleteObject with a DELETE method", async () => {
    const mockFetch = createMockFetch(null, 204);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await client.objects.deleteObject("ri.ontology.1", "Employee", "emp-1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objects/Employee/emp-1");
    expect(init.method).toBe("DELETE");
  });

  it("should call loadObjectSet with the correct path and POST body", async () => {
    const loadResponse: PageResponse<OntologyObject> = {
      data: [{ __apiName: "Employee", __primaryKey: "emp-1", name: "Alice" }],
    };
    const mockFetch = createMockFetch(loadResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.objects.loadObjectSet("ri.ontology.1", {
      objectSet: { type: "base", objectType: "Employee" },
    });
    expect(result.data).toHaveLength(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objectSets/loadObjects");
    expect(init.method).toBe("POST");
  });

  it("should call aggregate with the correct path", async () => {
    const aggResponse: AggregationResponse = {
      data: [{ group: {}, metrics: [{ name: "count", value: 42 }] }],
    };
    const mockFetch = createMockFetch(aggResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.objects.aggregate("ri.ontology.1", {
      objectSet: { type: "base", objectType: "Employee" },
      groupBy: [],
      aggregation: [{ type: "count", name: "count" }],
    });
    expect(result.data[0].metrics[0].value).toBe(42);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/objectSets/aggregate");
  });
});

// ---------------------------------------------------------------------------
// ActionsApi
// ---------------------------------------------------------------------------

describe("ActionsApi", () => {
  it("should call applyAction with correct path and body", async () => {
    const actionResult: ActionResult = {};
    const mockFetch = createMockFetch(actionResult);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await client.actions.applyAction("ri.ontology.1", "createEmployee", {
      parameters: { name: "Charlie" },
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/actions/createEmployee/apply");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      parameters: { name: "Charlie" },
    });
  });

  it("should call validateAction and return validation result", async () => {
    const validationResult: ValidationResult = {
      result: "VALID",
      submissionCriteria: [],
      parameters: {},
    };
    const mockFetch = createMockFetch(validationResult);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.actions.validateAction("ri.ontology.1", "createEmployee", {
      parameters: { name: "Charlie" },
    });
    expect(result.result).toBe("VALID");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/actions/createEmployee/validate");
  });

  it("should call applyBatch with correct path and body", async () => {
    const batchResult: BatchResult = {};
    const mockFetch = createMockFetch(batchResult);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await client.actions.applyBatch("ri.ontology.1", "createEmployee", {
      requests: [{ parameters: { name: "A" } }, { parameters: { name: "B" } }],
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/ontologies/ri.ontology.1/actions/createEmployee/applyBatch");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.requests).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DatasetsApi
// ---------------------------------------------------------------------------

describe("DatasetsApi", () => {
  it("should call listDatasets and return paginated results", async () => {
    const datasetsResponse: PageResponse<Dataset> = {
      data: [
        { rid: "ri.dataset.1", name: "MyDataset", parentFolderRid: "ri.folder.1" },
      ],
    };
    const mockFetch = createMockFetch(datasetsResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.datasets.listDatasets();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("MyDataset");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/datasets");
  });

  it("should call createDataset with a POST body", async () => {
    const dataset: Dataset = {
      rid: "ri.dataset.2",
      name: "NewDataset",
      parentFolderRid: "ri.folder.1",
    };
    const mockFetch = createMockFetch(dataset);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.datasets.createDataset({
      name: "NewDataset",
      parentFolderRid: "ri.folder.1",
    });
    expect(result.rid).toBe("ri.dataset.2");

    const [_url, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
  });

  it("should call getDataset with the correct path", async () => {
    const dataset: Dataset = {
      rid: "ri.dataset.1",
      name: "MyDataset",
      parentFolderRid: "ri.folder.1",
    };
    const mockFetch = createMockFetch(dataset);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.datasets.getDataset("ri.dataset.1");
    expect(result.name).toBe("MyDataset");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/datasets/ri.dataset.1");
  });

  it("should call deleteDataset with a DELETE method", async () => {
    const mockFetch = createMockFetch(null, 204);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await client.datasets.deleteDataset("ri.dataset.1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/datasets/ri.dataset.1");
    expect(init.method).toBe("DELETE");
  });

  it("should pass pagination params to listDatasets", async () => {
    const mockFetch = createMockFetch({ data: [] });
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await client.datasets.listDatasets({ pageSize: 25, pageToken: "tok-abc" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("pageSize=25");
    expect(url).toContain("pageToken=tok-abc");
  });
});

// ---------------------------------------------------------------------------
// AdminApi
// ---------------------------------------------------------------------------

describe("AdminApi", () => {
  it("should call listUsers and return paginated results", async () => {
    const usersResponse: PageResponse<User> = {
      data: [
        { id: "user-1", username: "alice", attributes: {} },
      ],
    };
    const mockFetch = createMockFetch(usersResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.admin.listUsers();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].username).toBe("alice");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/admin/users");
  });

  it("should call getUser with the correct path", async () => {
    const user: User = { id: "user-1", username: "alice", attributes: {} };
    const mockFetch = createMockFetch(user);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.admin.getUser("user-1");
    expect(result.username).toBe("alice");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/admin/users/user-1");
  });

  it("should call createUser with a POST body", async () => {
    const user: User = { id: "user-2", username: "bob", attributes: {} };
    const mockFetch = createMockFetch(user);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.admin.createUser({ username: "bob" });
    expect(result.username).toBe("bob");

    const [_url, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
  });

  it("should call listGroups and return paginated results", async () => {
    const groupsResponse: PageResponse<Group> = {
      data: [
        { id: "group-1", name: "Engineers", attributes: {} },
      ],
    };
    const mockFetch = createMockFetch(groupsResponse);
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    const result = await client.admin.listGroups();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("Engineers");

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v2/admin/groups");
  });

  it("should pass pagination params to listUsers", async () => {
    const mockFetch = createMockFetch({ data: [] });
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await client.admin.listUsers({ pageSize: 50 });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("pageSize=50");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  it("should propagate fetch errors from non-2xx responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errorCode: "NOT_FOUND",
          errorName: "ObjectNotFound",
          errorInstanceId: "err-1",
          parameters: {},
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await expect(
      client.ontologies.getOntology("ri.nonexistent"),
    ).rejects.toThrow();
  });

  it("should propagate network-level fetch errors", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await expect(
      client.ontologies.listOntologies(),
    ).rejects.toThrow("Network error");
  });

  it("should propagate 500 server errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ errorCode: "INTERNAL_ERROR", errorName: "InternalError" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "test-token-123",
      fetchFn: mockFetch,
    });

    await expect(
      client.datasets.listDatasets(),
    ).rejects.toThrow();
  });

  it("should propagate 401 unauthorized errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ errorCode: "UNAUTHORIZED" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = createFoundryClient({
      baseUrl: "https://example.openfoundry.com",
      token: "bad-token",
      fetchFn: mockFetch,
    });

    await expect(
      client.admin.listUsers(),
    ).rejects.toThrow();
  });
});
