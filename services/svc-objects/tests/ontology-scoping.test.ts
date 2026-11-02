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
 * resolution, which no in-memory test can reach. Semantic search, which svc-aip
 * answers, is scoped by forwarding the path's ontology.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { createPgConfig } from "@electric-sql/pglite/node-postgres";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";
import Fastify, { type FastifyInstance } from "fastify";
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

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** What docker-entrypoint-initdb.d and `pnpm db:migrate` apply, in their order. */
function migrationFiles(): string[] {
  const dir = path.join(REPO_ROOT, "db/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

const SCHEMAS: [string, () => string[]][] = [
  ["db/migrations", migrationFiles],
  ["scripts/migrate.sql", () => [path.join(REPO_ROOT, "scripts/migrate.sql")]],
];

describe.each(SCHEMAS)("PgObjectStore on a database built from %s", (schema, files) => {
  let db: PGlite;
  let pool: pg.Pool;
  let store: PgObjectStore;

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { citext, pgcrypto, pg_trgm, vector } });
    for (const file of files()) await db.exec(readFileSync(file, "utf8"));
    pool = new pg.Pool(createPgConfig(db));
    store = new PgObjectStore(pool);

    await pool.query(
      `INSERT INTO ontologies (rid, api_name) VALUES ($1, 'alpha'), ($2, 'beta')`,
      [ALPHA, BETA],
    );
    await pool.query(
      `INSERT INTO object_types (rid, ontology_rid, api_name, primary_key_api_name, primary_key_type)
       VALUES ('ot-alpha-employee', $1, 'Employee', 'id', 'STRING'),
              ('ot-beta-employee', $2, 'Employee', 'id', 'STRING'),
              ('ot-beta-badge', $2, 'Badge', 'id', 'STRING')`,
      [ALPHA, BETA],
    );
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await db?.close();
  });

  it("creates and upserts without an organization, each into its own ontology's type", async () => {
    await store.createObject(ALPHA, "Employee", "emp-1", { name: "Alpha Ann" });
    await store.createObject(BETA, "Employee", "emp-1", { name: "Beta Bob" });
    await store.upsertObject(BETA, "Employee", "emp-2", { name: "Beta Bea" });
    await store.upsertObject(BETA, "Employee", "emp-2", { name: "Beta Bea II" });

    expect((await store.getObject(ALPHA, "Employee", "emp-1")).properties.name).toBe("Alpha Ann");
    expect((await store.getObject(BETA, "Employee", "emp-1")).properties.name).toBe("Beta Bob");
    expect((await store.allObjects(ALPHA, "Employee")).map((o) => o.primaryKey)).toEqual([
      "emp-1",
    ]);
    expect(
      (await store.allObjects(BETA, "Employee")).map((o) => [o.primaryKey, o.properties.name]),
    ).toEqual([
      ["emp-1", "Beta Bob"],
      ["emp-2", "Beta Bea II"],
    ]);
    expect((await store.listObjects(BETA, "Employee")).totalCount).toBe(2);

    const { rows } = await pool.query<{ object_type_rid: string; primary_key: string }>(
      "SELECT object_type_rid, primary_key FROM objects ORDER BY object_type_rid, primary_key",
    );
    expect(rows).toEqual([
      { object_type_rid: "ot-alpha-employee", primary_key: "emp-1" },
      { object_type_rid: "ot-beta-employee", primary_key: "emp-1" },
      { object_type_rid: "ot-beta-employee", primary_key: "emp-2" },
    ]);
  });

  it("does not find a type through an ontology that does not declare it", async () => {
    await expect(store.allObjects(ALPHA, "Badge")).rejects.toMatchObject({ statusCode: 404 });
    await expect(store.createObject(ALPHA, "Badge", "b-1", {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it.runIf(schema === "db/migrations")(
    "records the organization when one is configured, and the column default when none is",
    async () => {
      await pool.query("INSERT INTO organizations (rid, display_name) VALUES ('org:acme', 'Acme')");
      const acme = new PgObjectStore(pool, "org:acme");
      await acme.createObject(ALPHA, "Employee", "emp-acme-1", {});
      await acme.upsertObject(ALPHA, "Employee", "emp-acme-2", {});

      const { rows } = await pool.query<{ primary_key: string; org_rid: string }>(
        "SELECT primary_key, org_rid FROM objects WHERE object_type_rid = 'ot-alpha-employee' ORDER BY primary_key",
      );
      expect(rows).toEqual([
        { primary_key: "emp-1", org_rid: "org:default" },
        { primary_key: "emp-acme-1", org_rid: "org:acme" },
        { primary_key: "emp-acme-2", org_rid: "org:acme" },
      ]);
    },
  );
});

// ===========================================================================
// 4. Semantic search forwards the path's ontology to svc-aip
// ===========================================================================

describe("Semantic search is scoped to the ontology in the path", () => {
  let aip: FastifyInstance;
  let app: FastifyInstance;
  const forwarded: Array<Record<string, unknown>> = [];

  beforeEach(async () => {
    forwarded.length = 0;
    aip = Fastify();
    aip.post("/api/v2/aip/semantic-search", async (request) => {
      const body = request.body as Record<string, unknown>;
      forwarded.push(body);
      return {
        results: [
          {
            rid: `emp-of-${String(body.ontologyRid)}`,
            objectType: "Employee",
            score: 1,
            properties: {},
          },
        ],
      };
    });
    const aipServiceUrl = await aip.listen({ port: 0, host: "127.0.0.1" });
    app = await createServer({
      config: { ...TEST_CONFIG, aipServiceUrl },
      store: new ObjectStore(null),
      linkStore: new LinkStore(null),
    });
  });

  afterEach(async () => {
    await app.close();
    await aip.close();
  });

  it("asks svc-aip only for the requested ontology's matches", async () => {
    for (const ontologyRid of [ALPHA, BETA]) {
      const res = await app.inject({
        method: "POST",
        url: `${v2(ontologyRid)}/objects/semantic-search`,
        payload: { query: "engineer", objectType: "Employee" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        ontologyRid,
        results: [
          {
            primaryKey: `emp-of-${ontologyRid}`,
            objectType: "Employee",
            properties: {},
            score: 1,
          },
        ],
      });
    }

    expect(forwarded.map((body) => body.ontologyRid)).toEqual([ALPHA, BETA]);
  });
});
