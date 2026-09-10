/**
 * The `/api/v1` ontology-metadata surface, checked against the v1 models in
 * `foundry_sdk/v1/ontologies/models.py`.
 *
 * The v2 routes serve the store's own definition objects, so every assertion
 * here names the v1 field set explicitly: `primaryKey` is a list, a property
 * carries a `baseType` string rather than a structured `dataType`, and both
 * object and action types carry a `rid` the store does not record.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { OntologyStore } from "../src/store/ontology-store.js";

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

let app: FastifyInstance;
let store: OntologyStore;
let ontologyRid: string;

/** Asserts that an object carries exactly these keys — no more, no fewer. */
function expectExactKeys(value: unknown, keys: string[]): void {
  expect(Object.keys(value as object).sort()).toEqual([...keys].sort());
}

beforeEach(async () => {
  store = new OntologyStore(null);
  app = await createServer({ config: TEST_CONFIG, store });

  const ontology = store.createOntology({
    apiName: "sales",
    displayName: "Sales",
    description: "Sales ontology",
  });
  ontologyRid = ontology.rid;

  store.createObjectType(ontologyRid, {
    apiName: "Employee",
    displayName: "Employee",
    description: "An employee",
    primaryKeyApiName: "id",
    primaryKeyType: "STRING",
    titlePropertyApiName: "name",
    properties: {
      id: { type: "STRING", nullable: false, multiplicity: "SINGLE" },
      name: {
        type: "STRING",
        nullable: false,
        multiplicity: "SINGLE",
        description: "Display name",
      },
      hiredOn: { type: "DATE", nullable: true, multiplicity: "SINGLE" },
      tags: { type: "STRING", nullable: true, multiplicity: "ARRAY" },
    },
    implements: [],
    status: "ACTIVE",
  });

  store.createObjectType(ontologyRid, {
    apiName: "Department",
    description: "A department",
    primaryKeyApiName: "id",
    primaryKeyType: "STRING",
    titlePropertyApiName: "id",
    properties: { id: { type: "STRING", nullable: false, multiplicity: "SINGLE" } },
    implements: [],
    status: "ACTIVE",
  });

  store.createLinkType(ontologyRid, {
    apiName: "worksIn",
    objectTypeApiName: "Employee",
    linkedObjectTypeApiName: "Department",
    cardinality: "ONE",
    foreignKeyPropertyApiName: "departmentId",
  });

  store.createActionType(ontologyRid, {
    apiName: "promote",
    description: "Promote an employee",
    parameters: {
      employeeId: { type: "STRING", required: true, description: "Who" },
      level: { type: "INTEGER", required: false },
    },
    modifiedEntities: { Employee: { created: false, modified: true } },
    status: "ACTIVE",
  });
});

describe("v1 ontologies", () => {
  it("GET /api/v1/ontologies answers a ListOntologiesResponse with data alone", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/ontologies" });

    expect(res.statusCode).toBe(200);
    // v1 does not paginate this operation: the model declares `data` and
    // nothing else, where the v2 route emits a page.
    expectExactKeys(res.json(), ["data"]);
    expect(res.json().data).toEqual([
      {
        apiName: "sales",
        displayName: "Sales",
        description: "Sales ontology",
        rid: ontologyRid,
      },
    ]);
  });

  it("GET /api/v1/ontologies/{rid} answers a v1 Ontology without the v2 route's version", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["apiName", "displayName", "description", "rid"]);
    expect(res.json()).not.toHaveProperty("version");
  });
});

describe("v1 object types", () => {
  it("GET .../objectTypes answers v1 ObjectTypes with a list primary key and baseType properties", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/objectTypes`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["data"]);

    const employee = res
      .json()
      .data.find((objectType: { apiName: string }) => objectType.apiName === "Employee");
    expectExactKeys(employee, [
      "apiName",
      "displayName",
      "status",
      "description",
      "primaryKey",
      "properties",
      "rid",
    ]);
    expect(employee.primaryKey).toEqual(["id"]);
    expect(employee.rid).toMatch(/^ri\.ontology\.main\.object-type\./);
  });

  it("GET .../objectTypes/{objectType} renders each property as a v1 ValueType", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/objectTypes/Employee`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().properties).toEqual({
      id: { baseType: "String" },
      name: { description: "Display name", baseType: "String" },
      hiredOn: { baseType: "LocalDate" },
      tags: { baseType: "Array<String>" },
    });
    // The store's own `type` / `nullable` / `multiplicity` are not v1 fields.
    expect(res.json().properties.id).not.toHaveProperty("type");
  });

  it("gives an object type the same rid on every read", async () => {
    // The stores key object types by api name and record no rid, so v1's
    // required `rid` is derived; a client that caches one must keep matching it.
    const first = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/objectTypes/Employee`,
    });
    const second = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/objectTypes/Employee`,
    });
    expect(first.json().rid).toBe(second.json().rid);
  });

  it("GET .../outgoingLinkTypes answers v1 LinkTypeSides describing the far end", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/objectTypes/Employee/outgoingLinkTypes`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["data"]);
    expect(res.json().data).toEqual([
      {
        apiName: "worksIn",
        displayName: "worksIn",
        status: "ACTIVE",
        objectTypeApiName: "Department",
        cardinality: "ONE",
        foreignKeyPropertyApiName: "departmentId",
      },
    ]);
    // `linkTypeRid` is required in the v2 model and absent from the v1 one.
    expect(res.json().data[0]).not.toHaveProperty("linkTypeRid");
  });

  it("GET .../outgoingLinkTypes omits the links this object type is the target of", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/objectTypes/Department/outgoingLinkTypes`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });
});

describe("v1 action types", () => {
  it("GET .../actionTypes answers v1 ActionTypes carrying operations and a rid", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/actionTypes`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["data"]);
    expectExactKeys(res.json().data[0], [
      "apiName",
      "description",
      "status",
      "parameters",
      "rid",
      "operations",
    ]);
  });

  it("GET .../actionTypes/{apiName} derives operations from the entities it modifies", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/actionTypes/promote`,
    });

    expect(res.statusCode).toBe(200);
    // `operations` is required in v1 `ActionType`; the v2 route omits it except
    // under the `fullMetadata` flag.
    expect(res.json().operations).toEqual([
      { type: "modifyObject", objectTypeApiName: "Employee" },
    ]);
    expect(res.json().parameters).toEqual({
      employeeId: { description: "Who", baseType: "String", required: true },
      level: { baseType: "Integer", required: false },
    });
  });
});

describe("v1 query types", () => {
  it("GET .../queryTypes answers an empty ListQueryTypesResponse", async () => {
    // OpenFoundry registers no Foundry query types, so an empty page is the
    // conformant answer rather than a stub.
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/queryTypes`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["data"]);
    expect(res.json().data).toEqual([]);
  });

  it("reports an unknown ontology rather than answering an empty page", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/ontologies/ri.ontology.main.ontology.absent/queryTypes",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("v1 value types without a declared multiplicity", () => {
  it("labels a property stored without `multiplicity` as single-valued", async () => {
    // The v2 create route stores a property declaration verbatim, so a client
    // that omits `multiplicity` leaves the field absent in the store.
    store.createObjectType(ontologyRid, {
      apiName: "Invoice",
      displayName: "Invoice",
      primaryKeyApiName: "id",
      primaryKeyType: "STRING",
      titlePropertyApiName: "id",
      properties: {
        id: { type: "STRING", nullable: false },
        lineItems: { type: "STRING", nullable: true, multiplicity: "ARRAY" },
      },
      implements: [],
      status: "ACTIVE",
    } as never);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/ontologies/${ontologyRid}/objectTypes/Invoice`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().properties.id.baseType).toBe("String");
    expect(res.json().properties.lineItems.baseType).toBe("Array<String>");
  });
});
