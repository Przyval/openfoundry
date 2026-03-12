import { describe, it, expect } from "vitest";
import * as endpoints from "../src/endpoints.js";
import type {
  EndpointDescriptor,
} from "../src/endpoints.js";
import type {
  Rid,
  PageToken,
  PropertyMap,
  ErrorResponse,
  PageRequest,
  OrderByClause as CommonOrderByClause,
} from "../src/common.js";
import type {
  OntologyV2,
  ObjectTypeV2,
  ActionTypeV2,
  LinkTypeV2,
  InterfaceTypeV2,
} from "../src/ontology.js";
import type {
  OntologyObject,
  ObjectSetDefinition,
  FilterDefinition,
  LoadObjectsRequest,
  AggregateRequest,
} from "../src/objects.js";
import type {
  ActionApplyRequest,
  ActionApplyResponse,
  BatchApplyRequest,
  ActionExecutionStatus,
} from "../src/actions.js";
import type {
  TokenRequest,
  TokenResponse,
  UserInfo,
  OAuthClient,
  OpenIdConfiguration,
  GrantType,
} from "../src/auth.js";
import type {
  Dataset,
  Branch,
  Transaction,
  DatasetFile,
} from "../src/datasets.js";
import type {
  User,
  Group,
  GroupMembership,
} from "../src/admin.js";
import type {
  Resource,
  ResourceType,
} from "../src/compass.js";

// Collect all exported endpoint descriptors
const VALID_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);

function getAllEndpoints(): [string, EndpointDescriptor][] {
  return Object.entries(endpoints).filter(
    (entry): entry is [string, EndpointDescriptor] =>
      Array.isArray(entry[1]) && entry[1].length === 5,
  );
}

describe("@openfoundry/api-types", () => {
  // ---- Type assertion tests (compile-time, runtime validates structure) ----

  it("common types can be constructed", () => {
    const rid: Rid = "ri.ontology.main.ontology.abc123";
    const token: PageToken = "next-page";
    const props: PropertyMap = { name: "Alice", age: 30 };
    const page: PageRequest = { pageSize: 10, pageToken: token };
    const order: CommonOrderByClause = { field: "name", direction: "ASC" };
    const err: ErrorResponse = {
      errorCode: "INVALID_ARGUMENT",
      errorName: "InvalidArgument",
      errorInstanceId: "abc",
      statusCode: 400,
    };

    expect(rid).toBeTypeOf("string");
    expect(props).toHaveProperty("name");
    expect(page.pageSize).toBe(10);
    expect(order.direction).toBe("ASC");
    expect(err.statusCode).toBe(400);
  });

  it("ontology types have correct shape", () => {
    const ont: OntologyV2 = {
      rid: "ri.ontology.main.ontology.1",
      apiName: "my-ontology",
      displayName: "My Ontology",
      description: "desc",
      version: "1.0.0",
    };
    const ot: ObjectTypeV2 = {
      apiName: "Employee",
      displayName: "Employee",
      primaryKey: "employeeId",
      properties: {
        employeeId: { apiName: "employeeId", displayName: "ID", dataType: "string", primaryKey: true },
      },
    };
    const at: ActionTypeV2 = {
      apiName: "promoteEmployee",
      displayName: "Promote",
      parameters: {},
    };
    const lt: LinkTypeV2 = {
      apiName: "manages",
      displayName: "Manages",
      sourceObjectType: "Employee",
      targetObjectType: "Employee",
    };
    const it2: InterfaceTypeV2 = {
      apiName: "HasName",
      displayName: "Has Name",
    };

    expect(ont.apiName).toBe("my-ontology");
    expect(ot.properties["employeeId"]?.primaryKey).toBe(true);
    expect(at.parameters).toEqual({});
    expect(lt.sourceObjectType).toBe("Employee");
    expect(it2.apiName).toBe("HasName");
  });

  it("object service types have correct shape", () => {
    const obj: OntologyObject = {
      rid: "ri.obj.1",
      objectType: "Employee",
      primaryKey: "emp-1",
      properties: { name: "Alice" },
    };
    const osd: ObjectSetDefinition = {
      type: "FILTER",
      objectSet: { type: "BASE", objectType: "Employee" },
      filter: { type: "eq", field: "name", value: "Alice" },
    };
    const req: LoadObjectsRequest = {
      objectSet: { type: "BASE", objectType: "Employee" },
      pageSize: 50,
    };
    const agg: AggregateRequest = {
      objectSet: { type: "BASE", objectType: "Employee" },
      aggregation: [{ type: "count" }],
    };

    expect(obj.objectType).toBe("Employee");
    expect(osd.type).toBe("FILTER");
    expect(req.pageSize).toBe(50);
    expect(agg.aggregation).toHaveLength(1);
  });

  it("action types have correct shape", () => {
    const req: ActionApplyRequest = { parameters: { level: "senior" } };
    const resp: ActionApplyResponse = { rid: "ri.exec.1", status: "SUCCEEDED" };
    const batch: BatchApplyRequest = { requests: [{ parameters: { a: 1 } }] };
    const status: ActionExecutionStatus = "RUNNING";

    expect(req.parameters).toHaveProperty("level");
    expect(resp.status).toBe("SUCCEEDED");
    expect(batch.requests).toHaveLength(1);
    expect(status).toBe("RUNNING");
  });

  it("auth types have correct shape", () => {
    const treq: TokenRequest = { grant_type: "client_credentials", client_id: "c1" };
    const tresp: TokenResponse = { access_token: "tok", token_type: "Bearer", expires_in: 3600, scope: "api" };
    const ui: UserInfo = { sub: "user-1" };
    const client: OAuthClient = { client_id: "c1", redirect_uris: [], grant_types: ["client_credentials"], scopes: ["api"] };
    const oidc: OpenIdConfiguration = {
      issuer: "https://example.com",
      authorization_endpoint: "/auth",
      token_endpoint: "/token",
      revocation_endpoint: "/revoke",
      userinfo_endpoint: "/userinfo",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
    };
    const gt: GrantType = "authorization_code";

    expect(treq.grant_type).toBe("client_credentials");
    expect(tresp.expires_in).toBe(3600);
    expect(ui.sub).toBe("user-1");
    expect(client.scopes).toContain("api");
    expect(oidc.issuer).toBe("https://example.com");
    expect(gt).toBe("authorization_code");
  });

  it("dataset types have correct shape", () => {
    const ds: Dataset = { rid: "ri.ds.1", name: "MyData", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" };
    const br: Branch = { rid: "ri.br.1", name: "main", datasetRid: "ri.ds.1", createdAt: "2024-01-01T00:00:00Z" };
    const tx: Transaction = {
      rid: "ri.tx.1", datasetRid: "ri.ds.1", branchRid: "ri.br.1",
      type: "SNAPSHOT", status: "COMMITTED", createdAt: "2024-01-01T00:00:00Z",
    };
    const f: DatasetFile = { path: "/data.csv", size: 1024, contentType: "text/csv", transactionRid: "ri.tx.1" };

    expect(ds.name).toBe("MyData");
    expect(br.datasetRid).toBe("ri.ds.1");
    expect(tx.type).toBe("SNAPSHOT");
    expect(f.size).toBe(1024);
  });

  it("admin and compass types have correct shape", () => {
    const user: User = {
      rid: "ri.u.1", username: "alice", email: "a@b.com", displayName: "Alice",
      status: "ACTIVE", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    };
    const group: Group = {
      rid: "ri.g.1", name: "admins", memberCount: 5,
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    };
    const membership: GroupMembership = { groupRid: "ri.g.1", userRid: "ri.u.1" };
    const resource: Resource = {
      rid: "ri.r.1", type: "FOLDER", name: "root", path: "/root",
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    };
    const rt: ResourceType = "DATASET";

    expect(user.status).toBe("ACTIVE");
    expect(group.memberCount).toBe(5);
    expect(membership.groupRid).toBe("ri.g.1");
    expect(resource.type).toBe("FOLDER");
    expect(rt).toBe("DATASET");
  });

  // ---- Endpoint descriptor tests ------------------------------------------

  it("all endpoint descriptors are 5-element tuples", () => {
    const allEndpoints = getAllEndpoints();
    expect(allEndpoints.length).toBeGreaterThan(0);
    for (const [name, desc] of allEndpoints) {
      expect(desc, `${name} should be a 5-tuple`).toHaveLength(5);
    }
  });

  it("all endpoint descriptors have valid HTTP methods", () => {
    for (const [name, desc] of getAllEndpoints()) {
      expect(VALID_METHODS.has(desc[0]), `${name} has invalid method "${desc[0]}"`).toBe(true);
    }
  });

  it("all endpoint paths start with /", () => {
    for (const [name, desc] of getAllEndpoints()) {
      expect(desc[1].startsWith("/"), `${name} path "${desc[1]}" should start with /`).toBe(true);
    }
  });

  it("no duplicate endpoint names exist", () => {
    const allEndpoints = getAllEndpoints();
    const names = allEndpoints.map(([name]) => name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});
