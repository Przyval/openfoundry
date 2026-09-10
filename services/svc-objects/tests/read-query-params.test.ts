/**
 * Behaviour of the Foundry read query parameters on the object endpoints.
 *
 * Each test asserts what the parameter actually changes about the response, not
 * merely that the request is accepted: a parameter that is declared but ignored
 * would tell a client its request was honoured when it was not.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { ObjectStore } from "../src/store/object-store.js";
import { LinkStore } from "../src/store/link-store.js";

const ONTOLOGY_RID = "ri.ontology.main.ontology.test-ontology";
const BASE_URL = `/api/v2/ontologies/${ONTOLOGY_RID}`;

let app: FastifyInstance;
let store: ObjectStore;
let linkStore: LinkStore;

beforeEach(async () => {
  store = new ObjectStore(null);
  linkStore = new LinkStore(null);
  app = await createServer({
    config: { port: 0, host: "127.0.0.1", logLevel: "silent" },
    store,
    linkStore,
  });
});

/** Seeds three employees whose names and salaries sort in different orders. */
function seedEmployees() {
  store.createObject("Employee", "emp-1", {
    name: "Carol",
    department: "Engineering",
    salary: 120000,
  });
  store.createObject("Employee", "emp-2", {
    name: "Alice",
    department: "Sales",
    salary: 90000,
  });
  store.createObject("Employee", "emp-3", {
    name: "Bob",
    department: "Engineering",
    salary: 150000,
  });
}

// ===========================================================================
// GET /objects/{objectType}
// ===========================================================================

describe("List objects — select", () => {
  it("returns only the selected properties", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?select=name`,
    });

    expect(res.statusCode).toBe(200);
    for (const obj of res.json().data) {
      expect(Object.keys(obj.properties)).toEqual(["name"]);
    }
  });

  it("honours an exploded list, which is how the Foundry clients send it", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?select=name&select=salary`,
    });

    expect(res.statusCode).toBe(200);
    for (const obj of res.json().data) {
      expect(Object.keys(obj.properties).sort()).toEqual(["name", "salary"]);
    }
  });

  it("returns every property when omitted", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee`,
    });

    expect(Object.keys(res.json().data[0].properties).sort()).toEqual([
      "department",
      "name",
      "salary",
    ]);
  });
});

describe("List objects — orderBy", () => {
  it("sorts ascending by default", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?orderBy=properties.name`,
    });

    expect(res.json().data.map((o: any) => o.properties.name)).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
  });

  it("sorts descending when the term says so", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?orderBy=properties.salary:desc`,
    });

    expect(res.json().data.map((o: any) => o.properties.salary)).toEqual([
      150000, 120000, 90000,
    ]);
  });

  it("accepts the documented `p.` shorthand", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?orderBy=p.name:desc`,
    });

    expect(res.json().data.map((o: any) => o.properties.name)).toEqual([
      "Carol",
      "Bob",
      "Alice",
    ]);
  });

  it("breaks ties with the second comma-delimited term", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?orderBy=properties.department,properties.salary:desc`,
    });

    expect(
      res.json().data.map((o: any) => [o.properties.department, o.properties.salary]),
    ).toEqual([
      ["Engineering", 150000],
      ["Engineering", 120000],
      ["Sales", 90000],
    ]);
  });

  it("rejects a property that is not prefixed", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?orderBy=name`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe("INVALID_ARGUMENT");
  });

  it("rejects an unknown sort direction", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?orderBy=properties.name:sideways`,
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("List objects — excludeRid", () => {
  it("withholds the rid when true", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?excludeRid=true`,
    });

    expect(res.statusCode).toBe(200);
    for (const obj of res.json().data) {
      expect(obj.rid).toBeUndefined();
      expect(obj.primaryKey).toBeDefined();
    }
  });

  it("returns the rid when false or omitted", async () => {
    seedEmployees();
    for (const url of [
      `${BASE_URL}/objects/Employee?excludeRid=false`,
      `${BASE_URL}/objects/Employee`,
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.json().data[0].rid).toBeDefined();
    }
  });

  it("rejects a value that is neither true nor false", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?excludeRid=yes`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe("INVALID_ARGUMENT");
  });
});

describe("List objects — snapshot", () => {
  it("hides objects created after paging began", async () => {
    seedEmployees();

    const first = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=2&snapshot=true`,
    });
    expect(first.json().data).toHaveLength(2);
    const token = first.json().nextPageToken;
    expect(token).toBeDefined();

    // A new object entering mid-paging must not appear in the frozen view.
    store.createObject("Employee", "emp-4", { name: "Dave", salary: 70000 });

    const second = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=2&snapshot=true&pageToken=${token}`,
    });
    expect(second.json().data.map((o: any) => o.primaryKey)).toEqual(["emp-3"]);
  });

  it("lets new objects in when snapshot is not requested", async () => {
    seedEmployees();

    const first = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=2`,
    });
    const token = first.json().nextPageToken;

    store.createObject("Employee", "emp-4", { name: "Dave", salary: 70000 });

    const second = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=2&pageToken=${token}`,
    });
    expect(second.json().data.map((o: any) => o.primaryKey)).toEqual([
      "emp-3",
      "emp-4",
    ]);
  });

  it("keeps the plain cursor token when snapshot is off", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=1`,
    });

    const cursor = JSON.parse(
      Buffer.from(res.json().nextPageToken, "base64url").toString("utf-8"),
    );
    expect(cursor).toEqual({ offset: 1 });
  });

  it("freezes the view even for objects created within the same millisecond", async () => {
    seedEmployees();

    const first = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=2&snapshot=true`,
    });
    const token = first.json().nextPageToken;

    // No await between the first page and these writes: a wall-clock snapshot
    // boundary would be unable to tell them apart from the seeded objects.
    store.createObject("Employee", "emp-5", { name: "Erin" });
    store.createObject("Employee", "emp-6", { name: "Frank" });

    const second = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=10&snapshot=true&pageToken=${token}`,
    });
    expect(second.json().data.map((o: any) => o.primaryKey)).toEqual(["emp-3"]);
  });
});

describe("List objects — pageSize and pageToken", () => {
  it("cuts the page and reports totalCount across all pages", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?pageSize=2`,
    });

    expect(res.json().data).toHaveLength(2);
    expect(res.json().totalCount).toBe(3);
    expect(res.json().nextPageToken).toBeDefined();
  });
});

// ===========================================================================
// GET /objects/{objectType}/{primaryKey}
// ===========================================================================

describe("Get object — select and excludeRid", () => {
  it("returns only the selected properties", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/emp-1?select=salary`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().properties).toEqual({ salary: 120000 });
  });

  it("withholds the rid when excludeRid is true", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/emp-1?excludeRid=true`,
    });

    expect(res.json().rid).toBeUndefined();
    expect(res.json().primaryKey).toBe("emp-1");
  });

  it("returns the whole object when neither is given", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/emp-1`,
    });

    expect(res.json().rid).toBeDefined();
    expect(Object.keys(res.json().properties).sort()).toEqual([
      "department",
      "name",
      "salary",
    ]);
  });
});

// ===========================================================================
// GET .../links/{linkType}
// ===========================================================================

describe("List linked objects — select, orderBy, excludeRid, snapshot", () => {
  beforeEach(() => {
    seedEmployees();
    store.createObject("Project", "proj-1", { name: "Zeta", budget: 10 });
    store.createObject("Project", "proj-2", { name: "Alpha", budget: 30 });
    store.createObject("Project", "proj-3", { name: "Mu", budget: 20 });
    for (const pk of ["proj-1", "proj-2", "proj-3"]) {
      linkStore.createLink("Employee", "emp-1", "projects", "Project", pk);
    }
  });

  const linksUrl = `${BASE_URL}/objects/Employee/emp-1/links/projects`;

  it("orders the linked objects by property", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${linksUrl}?orderBy=properties.name`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((o: any) => o.properties.name)).toEqual([
      "Alpha",
      "Mu",
      "Zeta",
    ]);
  });

  it("projects the selected properties", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${linksUrl}?select=budget`,
    });

    for (const obj of res.json().data) {
      expect(Object.keys(obj.properties)).toEqual(["budget"]);
    }
  });

  it("withholds the rid when excludeRid is true", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${linksUrl}?excludeRid=true`,
    });

    for (const obj of res.json().data) {
      expect(obj.rid).toBeUndefined();
    }
  });

  it("pages, and hides links added after a snapshot listing began", async () => {
    const first = await app.inject({
      method: "GET",
      url: `${linksUrl}?pageSize=2&snapshot=true`,
    });
    expect(first.json().data).toHaveLength(2);
    const token = first.json().nextPageToken;

    store.createObject("Project", "proj-4", { name: "Later", budget: 1 });
    linkStore.createLink("Employee", "emp-1", "projects", "Project", "proj-4");

    const second = await app.inject({
      method: "GET",
      url: `${linksUrl}?pageSize=2&snapshot=true&pageToken=${token}`,
    });
    expect(second.json().data).toHaveLength(1);
  });

  it("keeps the numeric page token when snapshot is off", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${linksUrl}?pageSize=2`,
    });

    expect(res.json().nextPageToken).toBe("2");
  });
});

// ===========================================================================
// executeInMemoryOnly
// ===========================================================================

describe("executeInMemoryOnly", () => {
  it("is satisfied by object search, which never leaves memory", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/search?executeInMemoryOnly=true`,
      payload: { where: { type: "eq", field: "department", value: "Sales" } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("is satisfied by objectSets/loadObjects", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects?executeInMemoryOnly=true`,
      payload: { objectSet: { type: "base", objectType: "Employee" } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
  });

  it("is satisfied by objectSets/aggregate", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/aggregate?executeInMemoryOnly=true`,
      payload: {
        objectSet: { type: "base", objectType: "Employee" },
        aggregation: [{ type: "count" }],
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("rejects a value that is neither true nor false", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/search?executeInMemoryOnly=maybe`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe("INVALID_ARGUMENT");
  });
});

// ===========================================================================
// branch / scenarioRid / transactionId
// ===========================================================================

describe("Ontology scoping — branch, scenarioRid, transactionId", () => {
  // OpenFoundry models no ontology branches, scenarios or transactions, so any
  // value names something that does not exist and is answered as not found
  // rather than silently served from the only state there is.
  beforeEach(() => {
    seedEmployees();
    linkStore.createLink("Employee", "emp-1", "peers", "Employee", "emp-2");
  });

  const reads = () => [
    ["GET", `${BASE_URL}/objects/Employee`, undefined],
    ["GET", `${BASE_URL}/objects/Employee/emp-1`, undefined],
    ["GET", `${BASE_URL}/objects/Employee/emp-1/links/peers`, undefined],
    ["POST", `${BASE_URL}/objects/Employee/search`, {}],
    [
      "POST",
      `${BASE_URL}/objects/Employee/aggregate`,
      { aggregation: [{ type: "count" }] },
    ],
    [
      "POST",
      `${BASE_URL}/objectSets/loadObjects`,
      { objectSet: { type: "base", objectType: "Employee" } },
    ],
    [
      "POST",
      `${BASE_URL}/objectSets/aggregate`,
      {
        objectSet: { type: "base", objectType: "Employee" },
        aggregation: [{ type: "count" }],
      },
    ],
  ] as const;

  it("answers FoundryBranchNotFound on every read that declares branch", async () => {
    for (const [method, url, payload] of reads()) {
      const res = await app.inject({
        method,
        url: `${url}?branch=experiment`,
        ...(payload !== undefined ? { payload } : {}),
      });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().errorName, url).toBe("FoundryBranchNotFound");
      expect(res.json().parameters.branch, url).toBe("experiment");
    }
  });

  it("serves normally when no branch is asked for", async () => {
    for (const [method, url, payload] of reads()) {
      const res = await app.inject({
        method,
        url,
        ...(payload !== undefined ? { payload } : {}),
      });
      expect(res.statusCode, url).toBe(200);
    }
  });

  it("answers OntologyScenarioNotFound on the object-set endpoints", async () => {
    for (const url of [
      `${BASE_URL}/objectSets/loadObjects`,
      `${BASE_URL}/objectSets/aggregate`,
    ]) {
      const res = await app.inject({
        method: "POST",
        url: `${url}?scenarioRid=ri.scenario.main.scenario.1`,
        payload: {
          objectSet: { type: "base", objectType: "Employee" },
          aggregation: [{ type: "count" }],
        },
      });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().errorName, url).toBe("OntologyScenarioNotFound");
      expect(res.json().parameters.scenarioRid, url).toBe(
        "ri.scenario.main.scenario.1",
      );
    }
  });

  it("answers OntologyTransactionNotFound on the object-set endpoints", async () => {
    for (const url of [
      `${BASE_URL}/objectSets/loadObjects`,
      `${BASE_URL}/objectSets/aggregate`,
    ]) {
      const res = await app.inject({
        method: "POST",
        url: `${url}?transactionId=txn-1`,
        payload: {
          objectSet: { type: "base", objectType: "Employee" },
          aggregation: [{ type: "count" }],
        },
      });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().errorName, url).toBe("OntologyTransactionNotFound");
    }
  });
});

// ===========================================================================
// Unknown property names
//
// The object type definition decides what a property is, never the data: a
// declared property no object has populated is real and must be served.
// ===========================================================================

describe("Unknown property names", () => {
  const EMPLOYEE_PROPERTIES = new Set([
    "name",
    "department",
    "salary",
    "endDate",
  ]);

  let typedApp: FastifyInstance;
  let typedStore: ObjectStore;
  let typedLinkStore: LinkStore;

  beforeEach(async () => {
    typedStore = new ObjectStore(null);
    typedLinkStore = new LinkStore(null);
    typedApp = await createServer({
      config: { port: 0, host: "127.0.0.1", logLevel: "silent" },
      store: typedStore,
      linkStore: typedLinkStore,
      objectTypeSchema: {
        propertyNames: (_ontologyRid, objectType) => {
          if (objectType === "Employee") return EMPLOYEE_PROPERTIES;
          if (objectType === "Office") return new Set(["city"]);
          return undefined;
        },
        linkTargetObjectType: (_ontologyRid, objectType, linkType) =>
          objectType === "Employee" && linkType === "reportsTo"
            ? "Employee"
            : undefined,
      },
    });

    // `endDate` is declared but populated on no object.
    typedStore.createObject("Employee", "emp-1", {
      name: "Carol",
      department: "Engineering",
      salary: 120000,
    });
    typedStore.createObject("Employee", "emp-2", {
      name: "Alice",
      department: "Sales",
      salary: 90000,
    });
  });

  const get = (url: string) =>
    typedApp.inject({ method: "GET", url: `${BASE_URL}${url}` });

  it("serves a declared property that no object has populated", async () => {
    const res = await get("/objects/Employee?select=name&select=endDate");

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
    for (const obj of res.json().data) {
      expect(obj.properties.endDate).toBeUndefined();
      expect(typeof obj.properties.name).toBe("string");
    }
  });

  it("answers PropertiesNotFound for a name the definition does not list", async () => {
    const res = await get("/objects/Employee?select=nmae");

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("PropertiesNotFound");
    expect(res.json().parameters.properties).toEqual(["nmae"]);
  });

  it("names only the undeclared properties", async () => {
    const res = await get("/objects/Employee?select=name&select=nmae");
    expect(res.json().parameters.properties).toEqual(["nmae"]);
  });

  it("sorts by a declared but unpopulated property without failing", async () => {
    const res = await get("/objects/Employee?orderBy=properties.endDate");

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("answers PropertiesNotFound for an orderBy the definition does not list", async () => {
    const res = await get("/objects/Employee?orderBy=properties.nonexistent");

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("PropertiesNotFound");
  });

  it("serves a declared but unpopulated property on the single-object endpoint", async () => {
    const res = await get("/objects/Employee/emp-1?select=name&select=endDate");

    expect(res.statusCode).toBe(200);
    expect(res.json().properties).toEqual({ name: "Carol" });
  });

  it("answers PropertiesNotFound on the single-object endpoint", async () => {
    const res = await get("/objects/Employee/emp-1?select=nmae");

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("PropertiesNotFound");
  });

  it("makes no claim about a type the definition source cannot answer for", async () => {
    typedStore.createObject("Contractor", "c-1", { name: "Dana" });
    const res = await get("/objects/Contractor?select=whatever");

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("makes no claim when no definition source is configured at all", async () => {
    seedEmployees();
    const res = await app.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee?select=whatever`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
  });

  it("checks select on the linked-objects endpoint the same way", async () => {
    typedLinkStore.createLink(
      "Employee",
      "emp-1",
      "reportsTo",
      "Employee",
      "emp-2",
    );

    const bad = await get("/objects/Employee/emp-1/links/reportsTo?select=nmae");
    expect(bad.statusCode).toBe(404);
    expect(bad.json().errorName).toBe("PropertiesNotFound");

    const good = await get(
      "/objects/Employee/emp-1/links/reportsTo?select=name&select=endDate",
    );
    expect(good.statusCode).toBe(200);
    expect(good.json().data[0].properties).toEqual({ name: "Alice" });
  });

  it("answers a linked-objects typo the same way with no links at all", async () => {
    const res = await get("/objects/Employee/emp-1/links/reportsTo?select=nmae");

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("PropertiesNotFound");
  });

  it("makes no claim for a link type the definition source does not declare", async () => {
    const res = await get("/objects/Employee/emp-1/links/undeclared?select=nmae");

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("checks select on the search body the same way", async () => {
    const res = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/search`,
      payload: { select: ["nmae"] },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("PropertiesNotFound");
  });

  it("checks select on the objectSets loadObjects body the same way", async () => {
    const res = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "base", objectType: "Employee" },
        select: ["nmae"],
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("PropertiesNotFound");
  });

  it("checks select through a nested filter object set", async () => {
    const res = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "filter",
          objectSet: { type: "base", objectType: "Employee" },
          where: { type: "eq", field: "name", value: "Alice" },
        },
        select: ["nmae"],
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("PropertiesNotFound");
  });

  it("checks select across every branch of a union object set", async () => {
    const union = (select: string[]) =>
      typedApp.inject({
        method: "POST",
        url: `${BASE_URL}/objectSets/loadObjects`,
        payload: {
          objectSet: {
            type: "union",
            objectSets: [
              { type: "base", objectType: "Employee" },
              { type: "static", objectType: "Employee", primaryKeys: ["emp-1"] },
            ],
          },
          select,
        },
      });

    const bad = await union(["nmae"]);
    expect(bad.statusCode).toBe(404);
    expect(bad.json().errorName).toBe("PropertiesNotFound");
    expect(bad.json().parameters.properties).toEqual(["nmae"]);

    const good = await union(["name", "endDate"]);
    expect(good.statusCode).toBe(200);
    expect(good.json().data.length).toBeGreaterThan(0);
  });

  it("omits objectType from the error when a union spans several types", async () => {
    const single = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "base", objectType: "Employee" },
        select: ["nmae"],
      },
    });
    expect(single.json().parameters.objectType).toBe("Employee");

    const spanning = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "union",
          objectSets: [
            { type: "base", objectType: "Employee" },
            { type: "base", objectType: "Office" },
          ],
        },
        select: ["nmae"],
      },
    });
    expect(spanning.statusCode).toBe(404);
    // A joined list would name no object type at all.
    expect(spanning.json().parameters).not.toHaveProperty("objectType");
    expect(spanning.json().parameters.properties).toEqual(["nmae"]);
  });

  it("makes no claim when a union branch has no declaration", async () => {
    typedStore.createObject("Contractor", "c-1", { name: "Dana" });

    const res = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: {
          type: "union",
          objectSets: [
            { type: "base", objectType: "Employee" },
            { type: "base", objectType: "Contractor" },
          ],
        },
        select: ["nmae"],
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it("checks the search body orderBy field", async () => {
    const bad = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/search`,
      payload: { orderBy: { field: "nmae" } },
    });
    expect(bad.statusCode).toBe(404);
    expect(bad.json().errorName).toBe("PropertiesNotFound");

    const good = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/search`,
      payload: { orderBy: { field: "name" } },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().data.map((o: any) => o.properties.name)).toEqual([
      "Alice",
      "Carol",
    ]);
  });

  it("checks the loadObjects body orderBy field", async () => {
    const bad = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "base", objectType: "Employee" },
        orderBy: [{ field: "nmae", direction: "asc" }],
      },
    });
    expect(bad.statusCode).toBe(404);
    expect(bad.json().errorName).toBe("PropertiesNotFound");

    const good = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "base", objectType: "Employee" },
        orderBy: [{ field: "name", direction: "asc" }],
      },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().data.map((o: any) => o.properties.name)).toEqual([
      "Alice",
      "Carol",
    ]);
  });

  it("sorts by a declared but unpopulated property on the body paths", async () => {
    const res = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "base", objectType: "Employee" },
        orderBy: [{ field: "endDate", direction: "asc" }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("serves a declared but unpopulated property on the search body", async () => {
    const res = await typedApp.inject({
      method: "POST",
      url: `${BASE_URL}/objects/Employee/search`,
      payload: { select: ["name", "endDate"] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });
});

// ===========================================================================
// Linked-objects error names the type actually checked
// ===========================================================================

describe("Linked objects — PropertiesNotFound names the target type", () => {
  it("names the link type's declared target, not the source type", async () => {
    const linkedStore = new ObjectStore(null);
    const linkedLinks = new LinkStore(null);
    const linkedApp = await createServer({
      config: { port: 0, host: "127.0.0.1", logLevel: "silent" },
      store: linkedStore,
      linkStore: linkedLinks,
      objectTypeSchema: {
        propertyNames: (_ontologyRid, objectType) =>
          objectType === "Department"
            ? new Set(["title"])
            : new Set(["name"]),
        linkTargetObjectType: (_ontologyRid, objectType, linkType) =>
          objectType === "Employee" && linkType === "manages"
            ? "Department"
            : undefined,
      },
    });

    linkedStore.createObject("Employee", "emp-1", { name: "Carol" });

    const res = await linkedApp.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/emp-1/links/manages?select=nmae`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().parameters.objectType).toBe("Department");
    expect(res.json().parameters.properties).toEqual(["nmae"]);
  });

  it("accepts a property of the target type that the source type lacks", async () => {
    const linkedStore = new ObjectStore(null);
    const linkedLinks = new LinkStore(null);
    const linkedApp = await createServer({
      config: { port: 0, host: "127.0.0.1", logLevel: "silent" },
      store: linkedStore,
      linkStore: linkedLinks,
      objectTypeSchema: {
        propertyNames: (_ontologyRid, objectType) =>
          objectType === "Department"
            ? new Set(["title"])
            : new Set(["name"]),
        linkTargetObjectType: () => "Department",
      },
    });

    linkedStore.createObject("Employee", "emp-1", { name: "Carol" });
    linkedStore.createObject("Department", "dep-1", { title: "Engineering" });
    linkedLinks.createLink("Employee", "emp-1", "manages", "Department", "dep-1");

    const res = await linkedApp.inject({
      method: "GET",
      url: `${BASE_URL}/objects/Employee/emp-1/links/manages?select=title`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].properties).toEqual({ title: "Engineering" });
  });
});
