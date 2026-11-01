/**
 * Object and link data are scoped to the ontology in the request path.
 *
 * An object type's API name is unique only within one ontology, so two
 * ontologies may each declare an `Employee`. Before this was scoped, the
 * in-memory stores were keyed by object type alone and `PgObjectStore`
 * resolved the type by name with no ontology predicate, so one ontology's
 * path served - and wrote - the other's objects, while the property checks
 * were already judged against the requested ontology's own declaration.
 *
 * Covered here three ways: every read and write route over the in-memory
 * stores, the stores' on-disk format (including the pre-scoping files, which
 * cannot be attributed to an ontology), and `PgObjectStore`'s type
 * resolution, which no in-memory test can reach.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type pg from "pg";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { ObjectStore } from "../src/store/object-store.js";
import { LinkStore } from "../src/store/link-store.js";
import { PgObjectStore } from "../src/store/pg-object-store.js";

const ALPHA = "ri.ontology.main.ontology.alpha";
const BETA = "ri.ontology.main.ontology.beta";
const v2 = (ontologyRid: string) => `/api/v2/ontologies/${ontologyRid}`;
const v1 = (ontologyRid: string) => `/api/v1/ontologies/${ontologyRid}`;

const TEST_CONFIG = { port: 0, host: "127.0.0.1", logLevel: "silent" } as const;

// ===========================================================================
// 1. Routes over the in-memory stores
// ===========================================================================

describe("Two ontologies that declare a same-named object type", () => {
  let app: FastifyInstance;
  let store: ObjectStore;
  let linkStore: LinkStore;

  beforeEach(async () => {
    store = new ObjectStore(null);
    linkStore = new LinkStore(null);
    app = await createServer({
      config: TEST_CONFIG,
      store,
      linkStore,
      // Alpha's Employee declares `name`; Beta's also declares `badge`.
      objectTypeSchema: {
        propertyNames: (ontologyRid, objectType) => {
          if (objectType === "Employee") {
            return ontologyRid === BETA
              ? new Set(["name", "badge"])
              : new Set(["name"]);
          }
          if (objectType === "Office") return new Set(["city"]);
          return undefined;
        },
        linkTargetObjectType: (_ontologyRid, objectType, linkType) =>
          objectType === "Employee" && linkType === "worksIn" ? "Office" : undefined,
      },
    });

    // The same primary key exists in both ontologies, with different values.
    store.createObject(ALPHA, "Employee", "emp-1", { name: "Alpha Ann" });
    store.createObject(BETA, "Employee", "emp-1", { name: "Beta Bob", badge: "B-7" });
    store.createObject(BETA, "Employee", "emp-2", { name: "Beta Bea", badge: "B-9" });
  });

  type Page = { data: Array<{ properties: Record<string, unknown> }> };
  const names = (body: Page) => body.data.map((o) => o.properties.name).sort();
  const cities = (body: Page) => body.data.map((o) => o.properties.city);

  it("lists each ontology's own objects only", async () => {
    const alpha = await app.inject({ method: "GET", url: `${v2(ALPHA)}/objects/Employee` });
    const beta = await app.inject({ method: "GET", url: `${v2(BETA)}/objects/Employee` });

    expect(alpha.json().totalCount).toBe(1);
    expect(names(alpha.json())).toEqual(["Alpha Ann"]);
    expect(beta.json().totalCount).toBe(2);
    expect(names(beta.json())).toEqual(["Beta Bea", "Beta Bob"]);
  });

  it("keeps the whole-collection listing path scoped too", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${v2(ALPHA)}/objects/Employee?orderBy=properties.name`,
    });
    expect(names(res.json())).toEqual(["Alpha Ann"]);
  });

  it("serves a property only the requested ontology declares, from that ontology's rows", async () => {
    // The original symptom: the check passed against Beta's declaration while
    // the rows came from wherever the type name happened to resolve.
    const beta = await app.inject({
      method: "GET",
      url: `${v2(BETA)}/objects/Employee?select=badge&orderBy=properties.badge`,
    });
    expect(beta.statusCode).toBe(200);
    expect((beta.json() as Page).data.map((o) => o.properties)).toEqual([
      { badge: "B-7" },
      { badge: "B-9" },
    ]);

    const alpha = await app.inject({
      method: "GET",
      url: `${v2(ALPHA)}/objects/Employee?select=badge`,
    });
    expect(alpha.statusCode).toBe(404);
    expect(alpha.json().errorName).toBe("PropertiesNotFound");
  });

  it("gets a single object from the requested ontology, and 404s on another's", async () => {
    const alpha = await app.inject({ method: "GET", url: `${v2(ALPHA)}/objects/Employee/emp-1` });
    const beta = await app.inject({ method: "GET", url: `${v2(BETA)}/objects/Employee/emp-1` });
    const missing = await app.inject({ method: "GET", url: `${v2(ALPHA)}/objects/Employee/emp-2` });

    expect(alpha.json().properties).toEqual({ name: "Alpha Ann" });
    expect(beta.json().properties).toEqual({ name: "Beta Bob", badge: "B-7" });
    expect(missing.statusCode).toBe(404);
  });

  it("creates a primary key in one ontology even when another already holds it", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objects/Employee`,
      payload: { primaryKey: "emp-2", properties: { name: "Alpha Abe" } },
    });
    expect(res.statusCode).toBe(201);

    expect(store.getObject(ALPHA, "Employee", "emp-2").properties).toEqual({ name: "Alpha Abe" });
    expect(store.getObject(BETA, "Employee", "emp-2").properties.name).toBe("Beta Bea");
  });

  it("still rejects a duplicate primary key within one ontology", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${v2(BETA)}/objects/Employee`,
      payload: { primaryKey: "emp-1", properties: { name: "dup" } },
    });
    expect(res.statusCode).toBe(409);
  });

  it("upserts into the requested ontology only", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objects/Employee`,
      payload: { primaryKey: "emp-1", properties: { name: "Alpha Ann II" }, upsert: true },
    });
    expect(res.statusCode).toBe(201);
    expect(store.getObject(ALPHA, "Employee", "emp-1").properties.name).toBe("Alpha Ann II");
    expect(store.getObject(BETA, "Employee", "emp-1").properties.name).toBe("Beta Bob");
  });

  it("updates and deletes in the requested ontology only", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `${v2(ALPHA)}/objects/Employee/emp-1`,
      payload: { properties: { name: "Renamed" } },
    });
    expect(put.statusCode).toBe(200);
    expect(store.getObject(BETA, "Employee", "emp-1").properties.name).toBe("Beta Bob");

    const del = await app.inject({ method: "DELETE", url: `${v2(ALPHA)}/objects/Employee/emp-1` });
    expect(del.statusCode).toBe(204);
    expect(store.allObjects(ALPHA, "Employee")).toEqual([]);
    expect(store.allObjects(BETA, "Employee")).toHaveLength(2);

    const again = await app.inject({ method: "DELETE", url: `${v2(ALPHA)}/objects/Employee/emp-2` });
    expect(again.statusCode).toBe(404);
  });

  it("scopes search and per-type aggregation", async () => {
    const search = await app.inject({
      method: "POST",
      url: `${v2(BETA)}/objects/Employee/search`,
      payload: { where: { type: "startsWith", field: "name", value: "Beta" } },
    });
    expect(names(search.json())).toEqual(["Beta Bea", "Beta Bob"]);

    const alphaSearch = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objects/Employee/search`,
      payload: { where: { type: "startsWith", field: "name", value: "Beta" } },
    });
    expect(alphaSearch.json().data).toEqual([]);

    const count = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objects/Employee/aggregate`,
      payload: { aggregation: [{ type: "count" }] },
    });
    expect(count.json().data[0].metrics[0].value).toBe(1);
  });

  it("resolves object sets within the requested ontology", async () => {
    const load = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objectSets/loadObjects`,
      payload: { objectSet: { type: "base", objectType: "Employee" } },
    });
    expect(names(load.json())).toEqual(["Alpha Ann"]);

    const staticSet = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objectSets/loadObjects`,
      payload: {
        objectSet: { type: "static", objectType: "Employee", primaryKeys: ["emp-1", "emp-2"] },
      },
    });
    expect(names(staticSet.json())).toEqual(["Alpha Ann"]);

    const aggregate = await app.inject({
      method: "POST",
      url: `${v2(BETA)}/objectSets/aggregate`,
      payload: {
        objectSet: { type: "base", objectType: "Employee" },
        aggregation: [{ type: "count" }],
      },
    });
    expect(aggregate.json().data[0].value).toBe(2);

    const search = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objectSets/search`,
      payload: { objectSet: { type: "base", objectType: "Employee" }, query: "Bob" },
    });
    expect(search.json().totalCount).toBe(0);
  });

  it("keeps links, and the objects they lead to, inside one ontology", async () => {
    store.createObject(ALPHA, "Office", "hq", { city: "Alpha City" });
    store.createObject(BETA, "Office", "hq", { city: "Beta City" });

    const created = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/objects/Employee/emp-1/links/worksIn`,
      payload: { targetObjectType: "Office", targetPrimaryKey: "hq" },
    });
    expect(created.statusCode).toBe(201);

    const alphaLinks = await app.inject({
      method: "GET",
      url: `${v2(ALPHA)}/objects/Employee/emp-1/links/worksIn`,
    });
    expect(cities(alphaLinks.json())).toEqual(["Alpha City"]);

    // Beta's emp-1 has no links, although Alpha's emp-1 links to an `hq` that
    // also exists in Beta.
    const betaLinks = await app.inject({
      method: "GET",
      url: `${v2(BETA)}/objects/Employee/emp-1/links/worksIn`,
    });
    expect(betaLinks.json().data).toEqual([]);

    const v1Links = await app.inject({
      method: "GET",
      url: `${v1(BETA)}/objects/Employee/emp-1/links/worksIn`,
    });
    expect(v1Links.json().data).toEqual([]);

    const around = (ontologyRid: string) =>
      app.inject({
        method: "POST",
        url: `${v2(ontologyRid)}/objectSets/loadObjects`,
        payload: {
          objectSet: {
            type: "searchAround",
            objectSet: { type: "base", objectType: "Employee" },
            link: "worksIn",
          },
        },
      });
    expect(cities((await around(ALPHA)).json())).toEqual(["Alpha City"]);
    expect((await around(BETA)).json().data).toEqual([]);

    const wrongDelete = await app.inject({
      method: "DELETE",
      url: `${v2(BETA)}/objects/Employee/emp-1/links/worksIn/hq`,
    });
    expect(wrongDelete.statusCode).toBe(404);
    expect(linkStore.getAllLinks(ALPHA, "Employee", "emp-1", "worksIn")).toHaveLength(1);

    const delete_ = await app.inject({
      method: "DELETE",
      url: `${v2(ALPHA)}/objects/Employee/emp-1/links/worksIn/hq`,
    });
    expect(delete_.statusCode).toBe(204);
    expect(linkStore.getAllLinks(ALPHA, "Employee", "emp-1", "worksIn")).toEqual([]);
  });

  it("scopes the v1 object surface", async () => {
    const list = await app.inject({ method: "GET", url: `${v1(ALPHA)}/objects/Employee` });
    expect(list.json().totalCount).toBe(1);
    expect(list.json().data[0].properties).toEqual({ name: "Alpha Ann" });

    const get = await app.inject({ method: "GET", url: `${v1(BETA)}/objects/Employee/emp-1` });
    expect(get.json().properties).toEqual({ name: "Beta Bob", badge: "B-7" });

    const search = await app.inject({
      method: "POST",
      url: `${v1(ALPHA)}/objects/Employee/search`,
      payload: {},
    });
    expect(search.json().totalCount).toBe(1);

    const aggregate = await app.inject({
      method: "POST",
      url: `${v1(BETA)}/objects/Employee/aggregate`,
      payload: { aggregation: [{ type: "count" }] },
    });
    expect(aggregate.json().data[0].metrics[0].value).toBe(2);
  });

  it("imports CSV rows into the ontology in the path", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${v2(ALPHA)}/import/csv`,
      payload: {
        csvContent: "id,name\nemp-9,Alpha Ivy\n",
        objectType: "Employee",
        primaryKeyColumn: "id",
      },
    });
    expect(res.json().imported).toBe(1);
    expect(store.getObject(ALPHA, "Employee", "emp-9").properties.name).toBe("Alpha Ivy");
    expect(store.getObjectsByKeys(BETA, "Employee", ["emp-9"])).toEqual([]);
  });
});

// ===========================================================================
// 2. On-disk format
// ===========================================================================

describe("Persisted stores keep the ontology", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "of-scoped-store-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("reloads each ontology's objects into that ontology", () => {
    const file = path.join(dir, "object-store.json");
    const first = new ObjectStore(file);
    first.createObject(ALPHA, "Employee", "emp-1", { name: "Alpha Ann" });
    first.createObject(BETA, "Employee", "emp-1", { name: "Beta Bob" });

    const reloaded = new ObjectStore(file);
    expect(reloaded.getObject(ALPHA, "Employee", "emp-1").properties.name).toBe("Alpha Ann");
    expect(reloaded.getObject(BETA, "Employee", "emp-1").properties.name).toBe("Beta Bob");
    expect(JSON.parse(readFileSync(file, "utf-8")).formatVersion).toBe(2);
  });

  it("reloads each ontology's links into that ontology", () => {
    const file = path.join(dir, "link-store.json");
    const first = new LinkStore(file);
    first.createLink(ALPHA, "Employee", "emp-1", "worksIn", "Office", "hq");

    const reloaded = new LinkStore(file);
    expect(reloaded.getAllLinks(ALPHA, "Employee", "emp-1", "worksIn")).toHaveLength(1);
    expect(reloaded.getAllLinks(BETA, "Employee", "emp-1", "worksIn")).toEqual([]);
  });

  it("moves a pre-scoping object file aside intact instead of serving it to any ontology", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = path.join(dir, "object-store.json");
    const legacy = {
      Employee: {
        "emp-1": {
          rid: "ri.phonograph2-objects.main.object.x",
          objectType: "Employee",
          primaryKey: "emp-1",
          properties: { name: "Unattributed" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    const legacyText = JSON.stringify(legacy, null, 2);
    writeFileSync(file, legacyText);

    const store = new ObjectStore(file);

    expect(store.allObjects(ALPHA, "Employee")).toEqual([]);
    const archived = readdirSync(dir).filter((f) => f.startsWith("object-store.json.unscoped-"));
    expect(archived).toHaveLength(1);
    expect(readFileSync(path.join(dir, archived[0]), "utf-8")).toBe(legacyText);
    expect(readdirSync(dir)).not.toContain("object-store.json");
    expect(warn).toHaveBeenCalledOnce();

    // The next write starts the scoped file afresh.
    store.createObject(ALPHA, "Employee", "emp-1", { name: "Alpha Ann" });
    expect(new ObjectStore(file).getObject(ALPHA, "Employee", "emp-1").properties.name).toBe(
      "Alpha Ann",
    );
  });

  it("moves a pre-scoping link file aside the same way", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = path.join(dir, "link-store.json");
    writeFileSync(
      file,
      JSON.stringify({
        "Employee:emp-1:worksIn": [
          {
            sourceObjectType: "Employee",
            sourcePrimaryKey: "emp-1",
            linkType: "worksIn",
            targetObjectType: "Office",
            targetPrimaryKey: "hq",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );

    const links = new LinkStore(file);

    expect(links.getAllLinks(ALPHA, "Employee", "emp-1", "worksIn")).toEqual([]);
    expect(readdirSync(dir).some((f) => f.startsWith("link-store.json.unscoped-"))).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("treats an empty pre-scoping file as empty, with nothing to move aside", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = path.join(dir, "object-store.json");
    writeFileSync(file, "{}");

    new ObjectStore(file);

    expect(readdirSync(dir)).toEqual(["object-store.json"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. PgObjectStore resolves the object type within the ontology
// ===========================================================================

/**
 * Answers the statements `PgObjectStore` issues from a small table of object
 * types and objects, so the test can tell which ontology's rows a read used.
 */
class FakePool {
  readonly statements: Array<{ text: string; values: unknown[] }> = [];

  /** object_types rows: ontology RID + api name -> object type RID. */
  private readonly types = [
    { rid: "ot-alpha-employee", ontology_rid: ALPHA, api_name: "Employee" },
    { rid: "ot-beta-employee", ontology_rid: BETA, api_name: "Employee" },
    { rid: "ot-beta-badge", ontology_rid: BETA, api_name: "Badge" },
  ];

  private readonly objects = [
    { rid: "o1", object_type_rid: "ot-alpha-employee", primary_key: "emp-1", properties: { name: "Alpha Ann" } },
    { rid: "o2", object_type_rid: "ot-beta-employee", primary_key: "emp-1", properties: { name: "Beta Bob" } },
  ];

  async query(config: { text: string; values?: unknown[] } | string) {
    const text = typeof config === "string" ? config : config.text;
    const values = typeof config === "string" ? [] : (config.values ?? []);
    this.statements.push({ text, values });

    if (/FROM object_types/.test(text) && /SELECT rid/.test(text)) {
      // Honour exactly the predicates the statement names, so an unscoped
      // lookup is answered the way Postgres would answer it: first row wins.
      const scoped = /ontology_rid = \$1 AND api_name = \$2/.test(text);
      const rows = this.types.filter((t) =>
        scoped
          ? t.ontology_rid === values[0] && t.api_name === values[1]
          : t.api_name === values[0],
      );
      return { rows: rows.map((t) => ({ rid: t.rid })), rowCount: rows.length };
    }
    if (/COUNT\(\*\)/.test(text)) {
      const total = this.objects.filter((o) => o.object_type_rid === values[0]).length;
      return { rows: [{ total }], rowCount: 1 };
    }
    if (/^\s*SELECT \* FROM objects/.test(text)) {
      const rows = this.objects
        .filter((o) => o.object_type_rid === values[0])
        .filter((o) =>
          /primary_key = \$2/.test(text) ? o.primary_key === values[1] : true,
        )
        .map((o) => ({ ...o, created_at: "t", updated_at: "t", version: 1 }));
      return { rows, rowCount: rows.length };
    }
    if (/INSERT INTO objects/.test(text)) {
      return {
        rows: [{ rid: values[0], primary_key: values[2], properties: JSON.parse(String(values[3])), created_at: "t", updated_at: "t" }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }

  async connect() {
    return { query: this.query.bind(this), release: () => {} };
  }
}

describe("PgObjectStore scopes object-type resolution to the ontology", () => {
  it("serves each ontology the rows hanging off its own object type", async () => {
    const pool = new FakePool();
    const store = new PgObjectStore(pool as unknown as pg.Pool);

    expect((await store.getObject(ALPHA, "Employee", "emp-1")).properties.name).toBe("Alpha Ann");
    expect((await store.getObject(BETA, "Employee", "emp-1")).properties.name).toBe("Beta Bob");
    expect((await store.allObjects(BETA, "Employee")).map((o) => o.properties.name)).toEqual([
      "Beta Bob",
    ]);
    expect((await store.listObjects(ALPHA, "Employee")).totalCount).toBe(1);
  });

  it("does not find a type through an ontology that does not declare it", async () => {
    const store = new PgObjectStore(new FakePool() as unknown as pg.Pool);

    await expect(store.allObjects(ALPHA, "Badge")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("writes into the requested ontology's object type", async () => {
    const pool = new FakePool();
    const store = new PgObjectStore(pool as unknown as pg.Pool);

    await store.createObject(BETA, "Employee", "emp-2", { name: "Beta Bea" });

    const insert = pool.statements.find((s) => /INSERT INTO objects/.test(s.text))!;
    expect(insert.values[1]).toBe("ot-beta-employee");
  });

  it("leaves org_rid to its column default when no organization is configured", async () => {
    // An explicit NULL overrides the `NOT NULL DEFAULT 'org:default'` that
    // db/migrations gives the column, so every create failed with 23502.
    const pool = new FakePool();
    await new PgObjectStore(pool as unknown as pg.Pool).createObject(
      ALPHA,
      "Employee",
      "emp-2",
      {},
    );
    await new PgObjectStore(pool as unknown as pg.Pool).upsertObject(
      ALPHA,
      "Employee",
      "emp-3",
      {},
    );

    const inserts = pool.statements.filter((s) => /INSERT INTO objects/.test(s.text));
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert.text).not.toMatch(/org_rid/);
      expect(insert.values).toHaveLength(4);
    }
  });

  it("names org_rid when an organization is configured", async () => {
    const pool = new FakePool();
    await new PgObjectStore(pool as unknown as pg.Pool, "org:acme").createObject(
      ALPHA,
      "Employee",
      "emp-2",
      {},
    );

    const insert = pool.statements.find((s) => /INSERT INTO objects/.test(s.text))!;
    expect(insert.text).toMatch(/org_rid/);
    expect(insert.values[4]).toBe("org:acme");
  });
});
