/**
 * The `/api/v1` ontology-object surface, checked against the v1 models in
 * `foundry_sdk/v1/ontologies/models.py`.
 *
 * This is where the two versions diverge most: v1's `OntologyObject` nests the
 * values under `properties` and carries a `rid`, while v2's `OntologyObjectV2`
 * is a bare property map. Every read assertion therefore checks the envelope,
 * not just the values inside it.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { ObjectStore } from "../src/store/object-store.js";
import { LinkStore } from "../src/store/link-store.js";

const ONTOLOGY_RID = "ri.ontology.main.ontology.test";
const BASE = `/api/v1/ontologies/${ONTOLOGY_RID}`;

let app: FastifyInstance;
let store: ObjectStore;
let linkStore: LinkStore;

/** Asserts that an object carries exactly these keys — no more, no fewer. */
function expectExactKeys(value: unknown, keys: string[]): void {
  expect(Object.keys(value as object).sort()).toEqual([...keys].sort());
}

beforeEach(async () => {
  store = new ObjectStore(null);
  linkStore = new LinkStore(null);
  app = await createServer({
    config: { port: 0, host: "127.0.0.1", logLevel: "silent" },
    store,
    linkStore,
  });

  store.createObject("Employee", "e1", {
    name: "Ada Lovelace",
    department: "Engineering",
    salary: 120000,
    skills: ["math", "logic"],
  });
  store.createObject("Employee", "e2", {
    name: "Grace Hopper",
    department: "Engineering",
    salary: 140000,
    skills: ["compilers"],
  });
  store.createObject("Employee", "e3", {
    name: "Katherine Johnson",
    department: "Research",
    salary: 130000,
    skills: [],
  });
  store.createObject("Department", "Engineering", { name: "Engineering" });
  linkStore.createLink("Employee", "e1", "worksIn", "Department", "Engineering");
});

describe("v1 object reads", () => {
  it("GET .../objects/{objectType} answers a v1 ListObjectsResponse", async () => {
    const res = await app.inject({ method: "GET", url: `${BASE}/objects/Employee` });

    expect(res.statusCode).toBe(200);
    // `totalCount` is required in v1 `ListObjectsResponse`.
    expectExactKeys(res.json(), ["data", "totalCount"]);
    expect(res.json().totalCount).toBe(3);
    for (const object of res.json().data) {
      expectExactKeys(object, ["properties", "rid"]);
    }
    // The store's bookkeeping fields are not part of the v1 model.
    expect(res.json().data[0]).not.toHaveProperty("primaryKey");
    expect(res.json().data[0]).not.toHaveProperty("objectType");
  });

  it("GET .../objects/{objectType} projects with `properties`, v1's name for select", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/objects/Employee?properties=name`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((o: { properties: unknown }) => o.properties)).toEqual([
      { name: "Ada Lovelace" },
      { name: "Grace Hopper" },
      { name: "Katherine Johnson" },
    ]);
  });

  it("GET .../objects/{objectType} paginates and orders", async () => {
    const first = await app.inject({
      method: "GET",
      url: `${BASE}/objects/Employee?pageSize=2&orderBy=properties.salary:desc`,
    });

    expect(first.statusCode).toBe(200);
    expectExactKeys(first.json(), ["data", "totalCount", "nextPageToken"]);
    expect(
      first.json().data.map((o: { properties: { name: string } }) => o.properties.name),
    ).toEqual(["Grace Hopper", "Katherine Johnson"]);

    const second = await app.inject({
      method: "GET",
      url: `${BASE}/objects/Employee?pageSize=2&orderBy=properties.salary:desc&pageToken=${first.json().nextPageToken}`,
    });
    expect(second.json().data).toHaveLength(1);
    expect(second.json()).not.toHaveProperty("nextPageToken");
  });

  it("GET .../objects/{objectType}/{primaryKey} answers one v1 OntologyObject", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/objects/Employee/e1`,
    });

    expect(res.statusCode).toBe(200);
    expectExactKeys(res.json(), ["properties", "rid"]);
    expect(res.json().properties.name).toBe("Ada Lovelace");
  });

  it("GET .../links/{linkType} answers a v1 ListLinkedObjectsResponse with no totalCount", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/objects/Employee/e1/links/worksIn`,
    });

    expect(res.statusCode).toBe(200);
    // `ListLinkedObjectsResponse` declares only `data` and `nextPageToken`,
    // unlike the plain object listing beside it — the v2 route emits a
    // `totalCount` here that v1 does not declare.
    expectExactKeys(res.json(), ["data"]);
    expectExactKeys(res.json().data[0], ["properties", "rid"]);
    expect(res.json().data[0].properties.name).toBe("Engineering");
  });
});

describe("v1 search", () => {
  async function search(payload: object) {
    return app.inject({
      method: "POST",
      url: `${BASE}/objects/Employee/search`,
      payload,
    });
  }

  it("answers a v1 SearchObjectsResponse from a `query` and `fields` request", async () => {
    const res = await search({
      query: { type: "eq", field: "department", value: "Engineering" },
      fields: ["name"],
    });

    expect(res.statusCode).toBe(200);
    // v1 names the filter `query` and the projection `fields`; the v2 body
    // names them `where` and `select`.
    expectExactKeys(res.json(), ["data", "totalCount"]);
    expect(res.json().totalCount).toBe(2);
    expect(res.json().data.map((o: { properties: unknown }) => o.properties)).toEqual([
      { name: "Ada Lovelace" },
      { name: "Grace Hopper" },
    ]);
  });

  it("orders by the v1 SearchOrderBy, whose orderings nest under `fields`", async () => {
    const res = await search({
      query: { type: "isNull", field: "name", value: false },
      fields: ["name"],
      orderBy: { fields: [{ field: "salary", direction: "desc" }] },
    });

    expect(res.statusCode).toBe(200);
    expect(
      res.json().data.map((o: { properties: { name: string } }) => o.properties.name),
    ).toEqual(["Grace Hopper", "Katherine Johnson", "Ada Lovelace"]);
  });

  it("reads `contains` as v1 does — array membership, not substring", async () => {
    const member = await search({
      query: { type: "contains", field: "skills", value: "compilers" },
      fields: ["name"],
    });
    expect(member.json().data.map((o: { properties: { name: string } }) => o.properties.name))
      .toEqual(["Grace Hopper"]);

    // The shared query engine's `contains` is a string substring test, which
    // would have matched nothing here and matched `phrase` queries instead.
    const substring = await search({
      query: { type: "phrase", field: "name", value: "Hopper" },
      fields: ["name"],
    });
    expect(substring.json().data.map((o: { properties: { name: string } }) => o.properties.name))
      .toEqual(["Grace Hopper"]);
  });

  it("implements the v1 term and prefix filters", async () => {
    const prefix = await search({
      query: { type: "prefix", field: "name", value: "Ada" },
      fields: ["name"],
    });
    expect(prefix.json().totalCount).toBe(1);

    const anyTerm = await search({
      query: { type: "anyTerm", field: "name", value: "hopper johnson" },
      fields: ["name"],
    });
    expect(anyTerm.json().totalCount).toBe(2);

    const allTerms = await search({
      query: { type: "allTerms", field: "name", value: "grace hopper" },
      fields: ["name"],
    });
    expect(allTerms.json().totalCount).toBe(1);
  });

  it("combines filters with and / or / not", async () => {
    const res = await search({
      query: {
        type: "and",
        value: [
          { type: "gte", field: "salary", value: 130000 },
          { type: "not", value: { type: "eq", field: "department", value: "Research" } },
        ],
      },
      fields: ["name"],
    });

    expect(res.json().data.map((o: { properties: { name: string } }) => o.properties.name))
      .toEqual(["Grace Hopper"]);
  });

  it("refuses fuzzy matching rather than answering an exact match as though it were fuzzy", async () => {
    const res = await search({
      query: { type: "anyTerm", field: "name", value: "hoper", fuzzy: true },
      fields: ["name"],
    });

    expect(res.statusCode).toBe(400);
  });

  it("refuses a filter type v1 does not declare", async () => {
    const res = await search({
      query: { type: "startsWith", field: "name", value: "Ada" },
      fields: ["name"],
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("v1 aggregate", () => {
  async function aggregate(payload: object) {
    return app.inject({
      method: "POST",
      url: `${BASE}/objects/Employee/aggregate`,
      payload,
    });
  }

  it("answers a v1 AggregateObjectsResponse whose metrics are name and value alone", async () => {
    const res = await aggregate({
      aggregation: [{ type: "count", name: "headcount" }],
      groupBy: [{ field: "department", type: "exact" }],
    });

    expect(res.statusCode).toBe(200);
    // v1 `AggregateObjectsResponse` has no `accuracy`, and
    // `AggregationMetricResult` is `{ name, value }` — the v2 route also emits
    // `type` and `field`.
    expectExactKeys(res.json(), ["data"]);
    for (const item of res.json().data) {
      expectExactKeys(item, ["group", "metrics"]);
      for (const metric of item.metrics) {
        expectExactKeys(metric, ["name", "value"]);
      }
    }
    expect(res.json().data).toEqual([
      { group: { department: "Engineering" }, metrics: [{ name: "headcount", value: 2 }] },
      { group: { department: "Research" }, metrics: [{ name: "headcount", value: 1 }] },
    ]);
  });

  it("filters with the v1 `query` field before aggregating", async () => {
    const res = await aggregate({
      aggregation: [{ type: "avg", field: "salary" }],
      query: { type: "eq", field: "department", value: "Engineering" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      { group: {}, metrics: [{ name: "avg", value: 130000 }] },
    ]);
  });

  it("refuses a grouping the query engine would silently treat as exact", async () => {
    // `ranges`, `fixedWidth` and `duration` are v1 groupings the shared engine
    // does not implement; grouping on the exact value instead would answer a
    // different question from the one asked.
    const res = await aggregate({
      aggregation: [{ type: "count" }],
      groupBy: [{ field: "salary", type: "fixedWidth", fixedWidth: 10000 }],
    });

    expect(res.statusCode).toBe(400);
  });

  it("refuses an aggregation function that is not implemented", async () => {
    const res = await aggregate({
      aggregation: [{ type: "approximatePercentile", field: "salary" }],
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("v1 approximateDistinct", () => {
  it("counts the distinct values rather than reporting 0", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/objects/Employee/aggregate`,
      payload: {
        aggregation: [{ type: "approximateDistinct", field: "department" }],
      },
    });

    expect(res.statusCode).toBe(200);
    // Engineering and Research — the engine's own case label is
    // `approximate_distinct`, so the v1 wire name has to be translated.
    expect(res.json().data).toEqual([
      { group: {}, metrics: [{ name: "approximateDistinct", value: 2 }] },
    ]);
  });
});

describe("v1 pageSize validation", () => {
  const urls = [
    `${BASE}/objects/Employee`,
    `${BASE}/objects/Employee/e1/links/worksIn`,
  ];

  for (const url of urls) {
    it(`rejects a non-numeric pageSize on GET ${url}`, async () => {
      const res = await app.inject({ method: "GET", url: `${url}?pageSize=abc` });

      expect(res.statusCode).toBe(400);
      expect(res.json().parameters.param).toBe("pageSize");
    });

    it(`rejects pageSize=0 on GET ${url}`, async () => {
      const res = await app.inject({ method: "GET", url: `${url}?pageSize=0` });

      expect(res.statusCode).toBe(400);
      expect(res.json().parameters.param).toBe("pageSize");
    });

    it(`still pages GET ${url} with a valid pageSize`, async () => {
      const res = await app.inject({ method: "GET", url: `${url}?pageSize=1` });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });
  }

  it("rejects a non-positive pageSize in the search body", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/objects/Employee/search`,
      payload: { pageSize: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().parameters.param).toBe("pageSize");
  });

  it("still pages search with a valid pageSize", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/objects/Employee/search`,
      payload: { pageSize: 2 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
    expect(res.json().nextPageToken).toBeDefined();
  });
});

describe("v1 search orderBy validation", () => {
  it("reports a non-string sort direction as a 400, not a 500", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/objects/Employee/search`,
      payload: { orderBy: { fields: [{ field: "name", direction: 1 }] } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().parameters.param).toBe("orderBy.fields");
  });
});
