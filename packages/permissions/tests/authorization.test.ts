import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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
import {
  FileAuthorizationStore,
  PgAuthorizationStore,
  ROOT_RESOURCE,
  evaluate,
  evaluateEach,
  identityFromClaims,
  identityFromHeaders,
  identityToHeaders,
  type AuthorizationStore,
  type Identity,
  type Operation,
  type RoleId,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// The model, run against every store
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

interface Backend {
  store: AuthorizationStore;
  close(): Promise<void>;
}

const sqlFiles = {
  "db/migrations": () => {
    const dir = path.join(REPO_ROOT, "db/migrations");
    return readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join(dir, f));
  },
  "scripts/migrate.sql": () => [path.join(REPO_ROOT, "scripts/migrate.sql")],
};

function pgBackend(source: keyof typeof sqlFiles): () => Promise<Backend> {
  return async () => {
    const db = await PGlite.create({ extensions: { citext, pgcrypto, pg_trgm, vector } });
    for (const file of sqlFiles[source]()) await db.exec(readFileSync(file, "utf8"));
    const pool = new pg.Pool(createPgConfig(db));
    return {
      store: new PgAuthorizationStore(pool),
      close: async () => {
        await pool.end();
        await db.close();
      },
    };
  };
}

const BACKENDS: [string, () => Promise<Backend>][] = [
  ["memory", async () => ({ store: new FileAuthorizationStore(null), close: async () => {} })],
  [
    "shared file",
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "authz-"));
      return {
        store: new FileAuthorizationStore(path.join(dir, "authorization.json")),
        close: async () => rmSync(dir, { recursive: true, force: true }),
      };
    },
  ],
  ["Postgres from db/migrations", pgBackend("db/migrations")],
  ["Postgres from scripts/migrate.sql", pgBackend("scripts/migrate.sql")],
];

const ONTOLOGY = "ri.ontology.main.ontology.alpha";
const OTHER = "ri.ontology.main.ontology.beta";

const person = (userId: string, extra: Partial<Identity> = {}): Identity => ({
  userId,
  groups: [],
  organization: "org-a",
  markings: [],
  platformAdmin: false,
  ...extra,
});

describe.each(BACKENDS)("authorization on %s", (_name, make) => {
  let backend: Backend;
  let store: AuthorizationStore;

  beforeAll(async () => {
    backend = await make();
    store = backend.store;
  }, 60_000);

  afterAll(async () => {
    await backend?.close();
  });

  async function grant(
    resourceRid: string,
    principalId: string,
    roleId: RoleId,
    principalType: "user" | "group" = "user",
  ) {
    await store.addGrant({
      resourceRid,
      principalType,
      principalId,
      roleId,
      grantedBy: "test",
      grantedAt: new Date().toISOString(),
    });
  }

  const allowed = async (who: Identity, op: Operation, chain: string[]) =>
    (await evaluate(store, who, op, [...chain, ROOT_RESOURCE])) === undefined;

  it("stores a grant once, lists it, and removes it", async () => {
    await grant(ONTOLOGY, "store-user", "viewer");
    await grant(ONTOLOGY, "store-user", "viewer");
    const held = (await store.listGrants(ONTOLOGY)).filter((g) => g.principalId === "store-user");
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ roleId: "viewer", principalType: "user", grantedBy: "test" });

    const who = { principalType: "user", principalId: "store-user" } as const;
    expect(await store.removeGrant(ONTOLOGY, who, "viewer")).toBe(true);
    expect(await store.removeGrant(ONTOLOGY, who, "viewer")).toBe(false);
  });

  it("allows what the role on the resource allows and denies the rest", async () => {
    await grant(ONTOLOGY, "vera", "viewer");
    await grant(ONTOLOGY, "eddie", "editor");

    expect(await allowed(person("vera"), "ontology:read", [ONTOLOGY])).toBe(true);
    expect(await allowed(person("vera"), "ontology:write", [ONTOLOGY])).toBe(false);
    expect(await allowed(person("eddie"), "ontology:write", [ONTOLOGY])).toBe(true);
    expect(await allowed(person("eddie"), "resource:manage-roles", [ONTOLOGY])).toBe(false);
    expect(await allowed(person("nobody"), "ontology:read", [ONTOLOGY])).toBe(false);
  });

  it("keeps a role on one resource from reaching another", async () => {
    expect(await allowed(person("vera"), "ontology:read", [OTHER])).toBe(false);
  });

  it("lets a discoverer see that a resource exists but not read it", async () => {
    await grant(ONTOLOGY, "dina", "discoverer");
    expect(await allowed(person("dina"), "resource:discover", [ONTOLOGY])).toBe(true);
    expect(await allowed(person("dina"), "ontology:read", [ONTOLOGY])).toBe(false);
  });

  it("inherits a role granted on a container down to what it contains", async () => {
    const folder = "ri.folder.main.folder.shared";
    const child = "ri.dataset.main.dataset.child";
    await grant(folder, "iris", "editor");
    expect(await evaluate(store, person("iris"), "datasets:write", [child, folder, ROOT_RESOURCE])).toBeUndefined();
    expect(await evaluate(store, person("iris"), "datasets:write", [child, ROOT_RESOURCE])).toBeDefined();
  });

  it("counts a role held through a group", async () => {
    await grant(OTHER, "analysts", "viewer", "group");
    expect(await allowed(person("gus", { groups: ["analysts"] }), "ontology:read", [OTHER])).toBe(true);
    expect(await allowed(person("gus", { groups: ["interns"] }), "ontology:read", [OTHER])).toBe(false);
    // a user named like a group does not inherit the group's role
    expect(await allowed(person("analysts"), "ontology:read", [OTHER])).toBe(false);
  });

  it("lets a platform administrator through the role layer, and an Owner on the root through admin:manage", async () => {
    expect(await allowed(person("root", { platformAdmin: true }), "ontology:write", [ONTOLOGY])).toBe(true);
    expect(await allowed(person("olga"), "admin:manage", [])).toBe(false);
    await grant(ROOT_RESOURCE, "olga", "owner");
    expect(await allowed(person("olga"), "admin:manage", [])).toBe(true);
    expect(await allowed(person("olga"), "ontology:delete", [ONTOLOGY])).toBe(true);
  });

  describe("mandatory controls", () => {
    const SECRET = "ri.ontology.main.ontology.secret";
    const BOTH = { markings: ["pii", "finance"] };

    beforeAll(async () => {
      await grant(SECRET, "mark", "owner");
      await grant(SECRET, "outsider", "owner");
      await store.setPolicy({ resourceRid: SECRET, organizations: ["org-a"], markings: ["pii", "finance"] });
    });

    it("requires every Marking on the resource, however high the role", async () => {
      expect(await allowed(person("mark", BOTH), "ontology:read", [SECRET])).toBe(true);
      expect(await allowed(person("mark", { markings: ["pii"] }), "ontology:read", [SECRET])).toBe(false);
      expect(await allowed(person("mark"), "ontology:read", [SECRET])).toBe(false);
    });

    it("binds a platform administrator too", async () => {
      expect(await allowed(person("root", { platformAdmin: true }), "ontology:read", [SECRET])).toBe(false);
      expect(await allowed(person("root", { platformAdmin: true, ...BOTH }), "ontology:read", [SECRET])).toBe(true);
    });

    it("keeps out a caller from another Organization despite a role and every Marking", async () => {
      expect(await allowed(person("outsider", { organization: "org-b", ...BOTH }), "ontology:read", [SECRET])).toBe(false);
      expect(await allowed(person("outsider", { organization: undefined, ...BOTH }), "ontology:read", [SECRET])).toBe(false);
      expect(await allowed(person("outsider", BOTH), "ontology:read", [SECRET])).toBe(true);
    });

    it("applies a Marking on a container to its contents", async () => {
      const folder = "ri.folder.main.folder.restricted";
      await store.setPolicy({ resourceRid: folder, organizations: [], markings: ["hr"] });
      await grant(folder, "hana", "viewer");
      const chain = ["ri.dataset.main.dataset.payroll", folder, ROOT_RESOURCE];
      expect(await evaluate(store, person("hana"), "datasets:read", chain)).toMatchObject({ layer: "marking" });
      expect(await evaluate(store, person("hana", { markings: ["hr"] }), "datasets:read", chain)).toBeUndefined();
    });

    it("lifts a restriction when its policy is emptied", async () => {
      await store.setPolicy({ resourceRid: SECRET, organizations: [], markings: [] });
      expect(await store.policiesFor([SECRET])).toEqual([]);
      expect(await allowed(person("mark"), "ontology:read", [SECRET])).toBe(true);
    });
  });
});

describe("deciding a listing", () => {
  it("agrees with evaluate on every resource, with one read of policies and one of grants", async () => {
    const inner = new FileAuthorizationStore(null);
    const at = "2026-01-01T00:00:00.000Z";
    const rids = Array.from({ length: 6 }, (_, i) => `ri.ontology.main.ontology.r${i}`);
    await inner.addGrant({ resourceRid: rids[0]!, principalType: "user", principalId: "lena", roleId: "discoverer", grantedBy: "t", grantedAt: at });
    await inner.addGrant({ resourceRid: rids[1]!, principalType: "group", principalId: "analysts", roleId: "viewer", grantedBy: "t", grantedAt: at });
    await inner.addGrant({ resourceRid: rids[2]!, principalType: "user", principalId: "lena", roleId: "owner", grantedBy: "t", grantedAt: at });
    await inner.setPolicy({ resourceRid: rids[2]!, organizations: [], markings: ["pii"] });
    await inner.setPolicy({ resourceRid: rids[3]!, organizations: ["org-b"], markings: [] });

    const calls = { policiesFor: 0, grantsFor: 0 };
    const counting: AuthorizationStore = {
      listGrants: (r) => inner.listGrants(r),
      addGrant: (g) => inner.addGrant(g),
      removeGrant: (r, p, role) => inner.removeGrant(r, p, role),
      setPolicy: (p) => inner.setPolicy(p),
      policiesFor: (r) => (calls.policiesFor++, inner.policiesFor(r)),
      grantsFor: (r, p) => (calls.grantsFor++, inner.grantsFor(r, p)),
    };

    for (const who of [
      person("lena", { groups: ["analysts"] }),
      person("lena", { groups: ["analysts"], markings: ["pii"] }),
      person("root", { platformAdmin: true }),
    ]) {
      const expected: boolean[] = [];
      for (const rid of rids) {
        expected.push((await evaluate(inner, who, "resource:discover", [rid, ROOT_RESOURCE])) === undefined);
      }
      calls.policiesFor = 0;
      calls.grantsFor = 0;
      expect(await evaluateEach(counting, who, "resource:discover", rids.map((r) => [r]))).toEqual(expected);
      expect(calls.policiesFor).toBe(1);
      expect(calls.grantsFor).toBeLessThanOrEqual(1);
    }
    expect(
      await evaluateEach(inner, person("lena", { groups: ["analysts"] }), "resource:discover", rids.map((r) => [r])),
    ).toEqual([true, true, false, false, false, false]);
    // A Marking on a container binds what is inside it.
    expect(
      await evaluateEach(inner, person("lena", { groups: ["analysts"] }), "resource:discover", [
        ["ri.object-type.inside", rids[2]!],
        ["ri.object-type.inside", rids[1]!],
      ]),
    ).toEqual([false, true]);
  });
});

it("shares grants between two store instances on one file", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "authz-"));
  try {
    const file = path.join(dir, "authorization.json");
    const writer = new FileAuthorizationStore(file);
    const reader = new FileAuthorizationStore(file);
    expect(await reader.listGrants(ONTOLOGY)).toEqual([]);
    await writer.addGrant({
      resourceRid: ONTOLOGY,
      principalType: "user",
      principalId: "wes",
      roleId: "viewer",
      grantedBy: "t",
      grantedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(await reader.listGrants(ONTOLOGY)).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Identity transport
// ---------------------------------------------------------------------------

describe("identity", () => {
  it("is built from verified claims, with ADMIN as a way to be a platform administrator and EDITOR not", () => {
    const admin = identityFromClaims({ sub: "ada", org: "org-a", roles: "ADMIN", groups: "g1 g2", markings: "pii" });
    expect(admin).toEqual({
      userId: "ada",
      organization: "org-a",
      platformAdmin: true,
      groups: ["g1", "g2"],
      markings: ["pii"],
    });
    expect(identityFromClaims({ sub: "bob", roles: "EDITOR" })?.platformAdmin).toBe(false);
    expect(identityFromClaims({ roles: "ADMIN" })).toBeUndefined();
  });

  it("survives the trip through headers", () => {
    const id = person("ada", { groups: ["g1"], markings: ["pii"], platformAdmin: true });
    expect(identityFromHeaders(identityToHeaders(id))).toEqual(id);
    expect(identityFromHeaders({})).toBeUndefined();
  });
});
