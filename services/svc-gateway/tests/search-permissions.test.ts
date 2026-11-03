/**
 * The gateway serves `/api/v2/search` itself, from an index that holds every
 * entity. It must show a caller only what the permission model lets them
 * discover, exactly as the owning services would.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { createPgConfig } from "@electric-sql/pglite/node-postgres";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";
import type { OpenFoundryClaims } from "@openfoundry/auth-tokens";
import { OpenFoundryApiError } from "@openfoundry/errors";
import { FileAuthorizationStore, ROOT_RESOURCE, setEnforcePermissions, type RoleId } from "@openfoundry/permissions";
import { searchRoutes } from "../src/routes/v2/search.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const OPEN = "ri.ontology.main.ontology.open";
const MARKED = "ri.ontology.main.ontology.marked";
const OPEN_TYPE = "ri.ontology.main.object-type.open-patient";
const MARKED_TYPE = "ri.ontology.main.object-type.marked-patient";
const DATASET = "ri.foundry.main.dataset.patients";
const USER = "ri.multipass.main.user.patient-admin";

let db: PGlite;
let pool: pg.Pool;
let authz: FileAuthorizationStore;
let app: FastifyInstance;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext, pgcrypto, pg_trgm, vector } });
  const dir = path.join(REPO_ROOT, "db/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  await db.exec(`
    INSERT INTO ontologies (rid, api_name) VALUES ('${OPEN}', 'open'), ('${MARKED}', 'marked');
    INSERT INTO object_types (rid, ontology_rid, api_name, primary_key_api_name, primary_key_type) VALUES
      ('${OPEN_TYPE}', '${OPEN}', 'Patient', 'id', 'STRING'),
      ('${MARKED_TYPE}', '${MARKED}', 'Patient', 'id', 'STRING');
    INSERT INTO search_index (rid, entity_type, title) VALUES
      ('${OPEN}', 'ONTOLOGY', 'Patient registry'),
      ('${MARKED}', 'ONTOLOGY', 'Patient records'),
      ('${OPEN_TYPE}', 'OBJECT_TYPE', 'Patient'),
      ('${MARKED_TYPE}', 'OBJECT_TYPE', 'Patient'),
      ('${DATASET}', 'DATASET', 'Patient extract'),
      ('${USER}', 'USER', 'Patient admin');
  `);
  pool = new pg.Pool(createPgConfig(db));
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await db?.close();
});

beforeEach(async () => {
  authz = new FileAuthorizationStore(null);
  app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof OpenFoundryApiError) return reply.status(error.statusCode).send(error.toJSON());
    return reply.status(500).send({ message: error.message });
  });
  // Stands in for the gateway's auth plugin, which sets `request.claims` from a verified token.
  app.addHook("onRequest", async (request) => {
    const raw = request.headers["test-claims"];
    if (typeof raw === "string") request.claims = JSON.parse(raw) as OpenFoundryClaims;
  });
  await app.register(searchRoutes, { prefix: "/search", pool, authorization: authz });
});

async function grant(resourceRid: string, principalId: string, roleId: RoleId) {
  await authz.addGrant({
    resourceRid,
    principalType: "user",
    principalId,
    roleId,
    grantedBy: "test",
    grantedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function search(claims: Record<string, unknown> | undefined, query = "q=patient") {
  const res = await app.inject({
    method: "GET",
    url: `/search?${query}`,
    headers: claims ? { "test-claims": JSON.stringify({ org: "org-a", ...claims }) } : {},
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { results: Array<{ rid: string }>; totalCount: number };
  return { rids: body.results.map((r) => r.rid).sort(), totalCount: body.totalCount };
}

describe("GET /search", () => {
  it("shows a caller with no role nothing", async () => {
    expect(await search({ sub: "nobody" })).toEqual({ rids: [], totalCount: 0 });
  });

  it("shows what a role reaches, an object type through its ontology, and stops at a Marking", async () => {
    await grant(OPEN, "dora", "discoverer");
    await grant(MARKED, "dora", "viewer");
    await authz.setPolicy({ resourceRid: MARKED, organizations: [], markings: ["pii"] });

    expect(await search({ sub: "dora" })).toEqual({ rids: [OPEN_TYPE, OPEN].sort(), totalCount: 2 });
    expect(await search({ sub: "dora", markings: "pii" })).toEqual({
      rids: [MARKED_TYPE, MARKED, OPEN_TYPE, OPEN].sort(),
      totalCount: 4,
    });
  });

  it("pages and counts only what the caller may see", async () => {
    await grant(OPEN, "dora", "viewer");
    await grant(DATASET, "dora", "viewer");
    const first = await search({ sub: "dora" }, "q=patient&limit=2&offset=0");
    const second = await search({ sub: "dora" }, "q=patient&limit=2&offset=2");
    expect(first.totalCount).toBe(3);
    expect([...first.rids, ...second.rids].sort()).toEqual([DATASET, OPEN_TYPE, OPEN].sort());
  });

  it("shows users only to a platform administrator, who is still bound by Markings", async () => {
    await authz.setPolicy({ resourceRid: MARKED, organizations: [], markings: ["pii"] });
    expect((await search({ sub: "root", roles: "ADMIN" })).rids).toEqual([DATASET, OPEN_TYPE, OPEN, USER].sort());
    await grant(ROOT_RESOURCE, "vera", "viewer");
    expect((await search({ sub: "vera" })).rids).not.toContain(USER);
  });
});

describe("GET /search over more than one page of ties", () => {
  it("returns every visible hit once", async () => {
    const wards = Array.from({ length: 150 }, (_, i) => `ri.foundry.main.dataset.ward-${String(i).padStart(3, "0")}`);
    await db.exec(
      `INSERT INTO search_index (rid, entity_type, title) VALUES ${wards.map((r) => `('${r}', 'DATASET', 'Ward')`).join(", ")}`,
    );
    await grant(ROOT_RESOURCE, "wanda", "viewer");
    const seen: string[] = [];
    for (const offset of [0, 100]) {
      const page = await search({ sub: "wanda" }, `q=ward&limit=100&offset=${offset}`);
      expect(page.totalCount).toBe(150);
      seen.push(...page.rids);
    }
    expect(seen.sort()).toEqual(wards);
  });
});

describe("an anonymous caller under ENFORCE_PERMISSIONS", () => {
  it("is refused search and reindex", async () => {
    setEnforcePermissions(true);
    try {
      expect((await app.inject({ method: "GET", url: "/search?q=patient" })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: "/search/reindex" })).statusCode).toBe(403);
    } finally {
      setEnforcePermissions(false);
    }
    expect((await app.inject({ method: "GET", url: "/search?q=patient" })).statusCode).toBe(200);
  });
});

describe("POST /search/reindex", () => {
  it("needs Owner on the platform root", async () => {
    await grant(ROOT_RESOURCE, "eddie", "editor");
    const reindex = (claims: Record<string, unknown>) =>
      app.inject({ method: "POST", url: "/search/reindex", headers: { "test-claims": JSON.stringify(claims) } });
    expect((await reindex({ sub: "eddie" })).statusCode).toBe(403);
    expect((await reindex({ sub: "root", roles: "ADMIN" })).statusCode).not.toBe(403);
  });
});
