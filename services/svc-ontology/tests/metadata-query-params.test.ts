/**
 * Behaviour of the Foundry metadata query parameters on the ontology endpoints.
 *
 * Each test asserts what the parameter changes about the response body, so a
 * parameter that was accepted and then ignored would fail here.
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

beforeEach(async () => {
  store = new OntologyStore(null);
  app = await createServer({ config: TEST_CONFIG, store });

  const created = await app.inject({
    method: "POST",
    url: "/api/v2/ontologies",
    payload: {
      apiName: "test-ontology",
      displayName: "Test Ontology",
      description: "Fixture ontology",
    },
  });
  ontologyRid = created.json().rid;

  await app.inject({
    method: "POST",
    url: `/api/v2/ontologies/${ontologyRid}/objectTypes`,
    payload: makeObjectType("Employee"),
  });
});

// ===========================================================================
// includeDatasources
// ===========================================================================

describe("Object types — includeDatasources", () => {
  it("adds the datasources field to each listed object type when true", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes?includeDatasources=true`,
    });

    expect(res.statusCode).toBe(200);
    for (const objectType of res.json().data) {
      expect(objectType.datasources).toEqual([]);
    }
  });

  it("omits the datasources field when false or absent", async () => {
    for (const suffix of ["?includeDatasources=false", ""]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v2/ontologies/${ontologyRid}/objectTypes${suffix}`,
      });
      expect(res.json().data[0]).not.toHaveProperty("datasources");
    }
  });

  it("adds the datasources field on the single-object-type read", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee?includeDatasources=true`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().datasources).toEqual([]);
  });

  it("omits it on the single-object-type read when not asked for", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee`,
    });

    expect(res.json()).not.toHaveProperty("datasources");
  });

  it("rejects a value that is neither true nor false", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes?includeDatasources=1`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe("INVALID_ARGUMENT");
  });
});

// ===========================================================================
// includeActionTypeFullMetadata
// ===========================================================================

describe("Full metadata — includeActionTypeFullMetadata", () => {
  beforeEach(async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      payload: {
        apiName: "hireEmployee",
        description: "Creates an employee",
        parameters: {
          fullName: { type: "STRING", required: true },
        },
        modifiedEntities: { Employee: { created: true, modified: false } },
        status: "ACTIVE",
      },
    });
    await app.inject({
      method: "POST",
      url: `/api/v2/ontologies/${ontologyRid}/actionTypes`,
      payload: {
        apiName: "promoteEmployee",
        description: "Promotes an employee",
        parameters: {
          employee: {
            type: "STRING",
            required: true,
            objectTypeApiName: "Employee",
          },
        },
        modifiedEntities: { Employee: { created: false, modified: true } },
        status: "ACTIVE",
      },
    });
  });

  it("populates actionTypesFullMetadata only when asked", async () => {
    const withFlag = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/fullMetadata?includeActionTypeFullMetadata=true`,
    });
    expect(withFlag.statusCode).toBe(200);
    expect(withFlag.json()).toHaveProperty("actionTypesFullMetadata");

    const withoutFlag = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/fullMetadata`,
    });
    expect(withoutFlag.json()).not.toHaveProperty("actionTypesFullMetadata");
  });

  it("always populates actionTypes, flag or not", async () => {
    for (const suffix of ["?includeActionTypeFullMetadata=true", ""]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v2/ontologies/${ontologyRid}/fullMetadata${suffix}`,
      });
      expect(res.json().actionTypes).toHaveLength(2);
    }
  });

  it("derives a createObject rule from a created entity", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/fullMetadata?includeActionTypeFullMetadata=true`,
    });

    const entry = res.json().actionTypesFullMetadata.hireEmployee;
    expect(entry.actionType.apiName).toBe("hireEmployee");
    expect(entry.fullLogicRules).toEqual([
      {
        type: "createObject",
        objectTypeApiName: "Employee",
        propertyArguments: {},
        structPropertyArguments: {},
      },
    ]);
  });

  it("names the parameter carrying the object a modifyObject rule acts on", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/fullMetadata?includeActionTypeFullMetadata=true`,
    });

    expect(
      res.json().actionTypesFullMetadata.promoteEmployee.fullLogicRules,
    ).toEqual([
      {
        type: "modifyObject",
        objectToModify: "employee",
        propertyArguments: {},
        structPropertyArguments: {},
      },
    ]);
  });

  it("rejects a value that is neither true nor false", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/fullMetadata?includeActionTypeFullMetadata=on`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe("INVALID_ARGUMENT");
  });
});

// ===========================================================================
// branch
// ===========================================================================

describe("Ontology metadata — branch", () => {
  // OpenFoundry models no ontology branches: every branch in the codebase is a
  // dataset branch. Any value therefore names something that does not exist.
  const endpoints = () => [
    `/api/v2/ontologies/${ontologyRid}/objectTypes`,
    `/api/v2/ontologies/${ontologyRid}/objectTypes/Employee`,
    `/api/v2/ontologies/${ontologyRid}/actionTypes`,
    `/api/v2/ontologies/${ontologyRid}/interfaceTypes`,
    `/api/v2/ontologies/${ontologyRid}/queryTypes`,
    `/api/v2/ontologies/${ontologyRid}/fullMetadata`,
  ];

  it("answers FoundryBranchNotFound naming the branch that was asked for", async () => {
    for (const url of endpoints()) {
      const res = await app.inject({ method: "GET", url: `${url}?branch=experiment` });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().errorName, url).toBe("FoundryBranchNotFound");
      expect(res.json().parameters.branch, url).toBe("experiment");
    }
  });

  it("rejects the names a real Foundry client might assume, since neither exists here", async () => {
    for (const branch of ["master", "main"]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v2/ontologies/${ontologyRid}/objectTypes?branch=${branch}`,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().errorName).toBe("FoundryBranchNotFound");
    }
  });

  it("serves the ontology normally when no branch is asked for", async () => {
    for (const url of endpoints()) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(200);
    }
  });

  it("also serves normally for an empty branch, which names nothing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/ontologies/${ontologyRid}/objectTypes?branch=`,
    });
    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
// fullMetadata against a paginating store
//
// `PgOntologyStore.listActionTypes` answers `{items, total}` rather than a bare
// array, so a handler that only understands the array shape reports an ontology
// as having no action types at all on a DATABASE_URL deployment.
// ===========================================================================

describe("Full metadata — paginating store shape", () => {
  let pagedApp: FastifyInstance;
  let pagedOntologyRid: string;

  beforeEach(async () => {
    const inner = new OntologyStore(null);
    const paged = Object.create(inner) as OntologyStore & {
      listActionTypes(ontologyRid: string): unknown;
    };
    paged.listActionTypes = (rid: string) => {
      const items = OntologyStore.prototype.listActionTypes.call(inner, rid);
      return { items, total: items.length };
    };

    pagedApp = await createServer({ config: TEST_CONFIG, store: paged });

    const created = await pagedApp.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "paged-ontology",
        displayName: "Paged Ontology",
        description: "Fixture ontology",
      },
    });
    pagedOntologyRid = created.json().rid;

    await pagedApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${pagedOntologyRid}/actionTypes`,
      payload: {
        apiName: "promoteEmployee",
        description: "Promotes an employee",
        parameters: {
          employee: {
            type: "STRING",
            required: true,
            objectTypeApiName: "Employee",
          },
        },
        modifiedEntities: { Employee: { created: false, modified: true } },
        status: "ACTIVE",
      },
    });
  });

  it("populates actionTypesFullMetadata from the paged shape", async () => {
    const res = await pagedApp.inject({
      method: "GET",
      url: `/api/v2/ontologies/${pagedOntologyRid}/fullMetadata?includeActionTypeFullMetadata=true`,
    });

    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().actionTypesFullMetadata)).toEqual([
      "promoteEmployee",
    ]);
    expect(
      res.json().actionTypesFullMetadata.promoteEmployee.actionType.apiName,
    ).toBe("promoteEmployee");
  });
});

// ===========================================================================
// Operations and logic rules derived from modifiedEntities
// ===========================================================================

describe("Full metadata — derived operations", () => {
  let derivedApp: FastifyInstance;
  let derivedRid: string;

  async function registerAction(payload: Record<string, unknown>) {
    return derivedApp.inject({
      method: "POST",
      url: `/api/v2/ontologies/${derivedRid}/actionTypes`,
      payload,
    });
  }

  async function fullMetadata() {
    const res = await derivedApp.inject({
      method: "GET",
      url: `/api/v2/ontologies/${derivedRid}/fullMetadata?includeActionTypeFullMetadata=true`,
    });
    expect(res.statusCode).toBe(200);
    return res.json().actionTypesFullMetadata;
  }

  beforeEach(async () => {
    derivedApp = await createServer({
      config: TEST_CONFIG,
      store: new OntologyStore(null),
    });
    const created = await derivedApp.inject({
      method: "POST",
      url: "/api/v2/ontologies",
      payload: {
        apiName: "derived-ontology",
        displayName: "Derived Ontology",
        description: "Fixture ontology",
      },
    });
    derivedRid = created.json().rid;
  });

  it("reports a modify-only action through operations", async () => {
    await registerAction({
      apiName: "reorderProduct",
      description: "Reorders a product",
      parameters: {
        productId: { type: "STRING", required: true },
        quantity: { type: "INTEGER", required: true },
      },
      modifiedEntities: { TreatmentProduct: { created: false, modified: true } },
      status: "ACTIVE",
    });

    const entry = (await fullMetadata()).reorderProduct;
    expect(entry.actionType.operations).toEqual([
      { type: "modifyObject", objectTypeApiName: "TreatmentProduct" },
    ]);
    // No conformant fullLogicRules variant exists without a parameter id.
    expect(entry.fullLogicRules).toEqual([]);
  });

  it("reports a create-and-modify entity as createOrModifyObject", async () => {
    await registerAction({
      apiName: "upsertEmployee",
      description: "Creates or updates an employee",
      parameters: { fullName: { type: "STRING", required: true } },
      modifiedEntities: { Employee: { created: true, modified: true } },
      status: "ACTIVE",
    });

    const entry = (await fullMetadata()).upsertEmployee;
    expect(entry.fullLogicRules).toEqual([
      {
        type: "createOrModifyObject",
        objectTypeApiName: "Employee",
        propertyArguments: {},
        structPropertyArguments: {},
      },
    ]);
    expect(entry.actionType.operations).toEqual([
      { type: "createObject", objectTypeApiName: "Employee" },
      { type: "modifyObject", objectTypeApiName: "Employee" },
    ]);
  });

  it("keeps a create-only entity as createObject", async () => {
    await registerAction({
      apiName: "hireEmployee",
      description: "Creates an employee",
      parameters: { fullName: { type: "STRING", required: true } },
      modifiedEntities: { Employee: { created: true, modified: false } },
      status: "ACTIVE",
    });

    const entry = (await fullMetadata()).hireEmployee;
    expect(entry.fullLogicRules).toEqual([
      {
        type: "createObject",
        objectTypeApiName: "Employee",
        propertyArguments: {},
        structPropertyArguments: {},
      },
    ]);
    expect(entry.actionType.operations).toEqual([
      { type: "createObject", objectTypeApiName: "Employee" },
    ]);
  });

  it("reports every entity of a multi-entity action through operations", async () => {
    await registerAction({
      apiName: "assignTechnician",
      description: "Assigns a technician",
      parameters: { technicianId: { type: "STRING", required: true } },
      modifiedEntities: {
        Technician: { created: false, modified: true },
        WorkOrder: { created: false, modified: true },
      },
      status: "ACTIVE",
    });

    const entry = (await fullMetadata()).assignTechnician;
    expect(entry.actionType.operations).toEqual([
      { type: "modifyObject", objectTypeApiName: "Technician" },
      { type: "modifyObject", objectTypeApiName: "WorkOrder" },
    ]);
  });

  it("leaves the always-present actionTypes list without operations", async () => {
    await registerAction({
      apiName: "reorderProduct",
      description: "Reorders a product",
      parameters: { productId: { type: "STRING", required: true } },
      modifiedEntities: { TreatmentProduct: { created: false, modified: true } },
      status: "ACTIVE",
    });

    const res = await derivedApp.inject({
      method: "GET",
      url: `/api/v2/ontologies/${derivedRid}/fullMetadata?includeActionTypeFullMetadata=true`,
    });
    expect(res.json().actionTypes[0]).not.toHaveProperty("operations");
  });
});
