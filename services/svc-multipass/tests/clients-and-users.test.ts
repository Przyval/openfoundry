import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { createPgConfig } from "@electric-sql/pglite/node-postgres";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite-pgvector";
import { parseDeclaredClients } from "../src/store/client-store.js";
import {
  authenticate,
  canonicalRoles,
  createUserDirectory,
  InMemoryUserDirectory,
  isValidUsername,
} from "../src/store/user-store.js";
import { PgUserStore, UserAlreadyExistsError } from "../src/store/pg-user-store.js";
import { user } from "./fixtures.js";

// ---------------------------------------------------------------------------
// OAUTH_CLIENTS
// ---------------------------------------------------------------------------

describe("parseDeclaredClients", () => {
  it("treats an empty value as no clients", () => {
    expect(parseDeclaredClients("")).toEqual([]);
    expect(parseDeclaredClients("  ")).toEqual([]);
  });

  it("makes a declaration without a secret a public browser client", () => {
    const [client] = parseDeclaredClients(
      JSON.stringify([{ clientId: "console", redirectUris: ["https://c.example.com/login"] }]),
    );
    expect(client).toEqual({
      clientId: "console",
      clientName: "console",
      isPublic: true,
      redirectUris: ["https://c.example.com/login"],
      grantTypes: ["authorization_code", "refresh_token"],
      scopes: ["api:read", "api:write"],
    });
  });

  it("makes a declaration with a secret a confidential service client, roles canonicalised", () => {
    const [client] = parseDeclaredClients(
      JSON.stringify([{ clientId: "sync", clientSecret: "s3cret", roles: ["service_account"] }]),
    );
    expect(client).toMatchObject({
      clientId: "sync",
      clientSecret: "s3cret",
      isPublic: false,
      grantTypes: ["client_credentials"],
      redirectUris: [],
      roles: ["SERVICE_ACCOUNT"],
    });
  });

  for (const [label, value, message] of [
    ["invalid JSON", "[{", /not valid JSON/],
    ["a non-array", '{"clientId":"x"}', /JSON array/],
    ["a missing clientId", "[{}]", /clientId/],
    ["a duplicate clientId", '[{"clientId":"a","redirectUris":["https://a.example"]},{"clientId":"a","redirectUris":["https://a.example"]}]', /twice/],
    ["an empty secret", '[{"clientId":"a","clientSecret":""}]', /must not be empty/],
    ["an unknown grant", '[{"clientId":"a","clientSecret":"s","grantTypes":["password"]}]', /unsupported grant type/],
    ["client_credentials without a secret", '[{"clientId":"a","grantTypes":["client_credentials"]}]', /needs a clientSecret/],
    ["authorization_code without a redirect URI", '[{"clientId":"a"}]', /at least one redirect URI/],
    ["a relative redirect URI", '[{"clientId":"a","redirectUris":["/login"]}]', /absolute http/],
    ["a redirect URI with a fragment", '[{"clientId":"a","redirectUris":["https://a.example/#x"]}]', /without a fragment/],
    ["a non-http redirect URI", '[{"clientId":"a","redirectUris":["javascript:alert(1)"]}]', /absolute http/],
    ["roles on a browser client", '[{"clientId":"a","redirectUris":["https://a.example"],"roles":["ADMIN"]}]', /roles apply only/],
    ["an unknown role", '[{"clientId":"a","clientSecret":"s","roles":["SUPERUSER"]}]', /unknown role "SUPERUSER"/],
    ["a non-string field", '[{"clientId":"a","clientSecret":"s","scopes":"api:read"}]', /scopes must be an array/],
  ] as const) {
    it(`rejects ${label}`, () => {
      expect(() => parseDeclaredClients(value)).toThrow(message);
    });
  }
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

describe("usernames and roles", () => {
  it("never lets a username take the service:<client> subject form", () => {
    expect(isValidUsername("alice")).toBe(true);
    expect(isValidUsername("a.b-c_d@example.com")).toBe(true);
    expect(isValidUsername("service:admin")).toBe(false);
    expect(isValidUsername("")).toBe(false);
    expect(isValidUsername(" alice")).toBe(false);
    expect(isValidUsername("a".repeat(65))).toBe(false);
  });

  it("canonicalises roles to the names the permission middleware resolves", () => {
    expect(canonicalRoles(["admin", " Service_Account ", "ADMIN", ""])).toEqual(["ADMIN", "SERVICE_ACCOUNT"]);
    expect(() => canonicalRoles(["platform-admin"])).toThrow(/unknown role/);
  });
});

describe("authenticate", () => {
  it("returns the stored record, whatever case the username was typed in", async () => {
    const directory = new InMemoryUserDirectory([await user("Alice", "pw-alice-1", { roles: ["SERVICE_ACCOUNT"] })]);
    const found = await authenticate(directory, "alice", "pw-alice-1");
    expect(found?.username).toBe("Alice");
    expect(found?.roles).toEqual(["SERVICE_ACCOUNT"]);
  });

  it("refuses a wrong password, a disabled user, a user with no password, and an unknown user", async () => {
    const directory = new InMemoryUserDirectory([
      await user("alice", "pw-alice-1"),
      await user("dave", "pw-dave-1", { active: false }),
      await user("nopass", null),
    ]);
    expect(await authenticate(directory, "alice", "pw-alice-2")).toBeUndefined();
    expect(await authenticate(directory, "dave", "pw-dave-1")).toBeUndefined();
    expect(await authenticate(directory, "nopass", "")).toBeUndefined();
    expect(await authenticate(directory, "nobody", "pw-alice-1")).toBeUndefined();
    expect(await authenticate(directory, "service:admin", "x")).toBeUndefined();
  });
});

describe("createUserDirectory", () => {
  it("has the development accounts outside production only", async () => {
    const dev = await createUserDirectory({ nodeEnv: "development" });
    expect((await authenticate(dev, "admin", "admin123"))?.roles).toEqual(["ADMIN"]);

    const prod = await createUserDirectory({ nodeEnv: "production" });
    expect(await prod.findByUsername("admin")).toBeUndefined();
  });

  it("serves the persistent directory, behind the development accounts outside production", async () => {
    const persistent = new InMemoryUserDirectory([
      await user("alice", "pw-alice-1"),
      await user("admin", "persistent-admin-pw"),
    ]);

    const prod = await createUserDirectory({ nodeEnv: "production", persistent });
    expect(await authenticate(prod, "alice", "pw-alice-1")).toBeDefined();
    expect(await authenticate(prod, "admin", "persistent-admin-pw")).toBeDefined();

    const dev = await createUserDirectory({ nodeEnv: "development", persistent });
    expect(await authenticate(dev, "alice", "pw-alice-1")).toBeDefined();
    expect(await authenticate(dev, "admin", "admin123")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PgUserStore against both schema sources
// ---------------------------------------------------------------------------

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

describe.each(SCHEMAS)("PgUserStore on a database built from %s", (_name, files) => {
  let db: PGlite;
  let pool: pg.Pool;
  let store: PgUserStore;

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { citext, pgcrypto, pg_trgm, vector } });
    for (const file of files()) await db.exec(readFileSync(file, "utf8"));
    pool = new pg.Pool(createPgConfig(db));
    store = new PgUserStore(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await db?.close();
  });

  it("creates a user and finds it by username", async () => {
    await pool.query("INSERT INTO organizations (rid, display_name) VALUES ('org:acme', 'Acme')");
    const created = await store.createUser({
      username: "alice",
      displayName: "Alice A.",
      passwordHash: "salt:key",
      roles: ["SERVICE_ACCOUNT"],
      orgRid: "org:acme",
    });
    const expected = {
      username: "alice",
      displayName: "Alice A.",
      passwordHash: "salt:key",
      roles: ["SERVICE_ACCOUNT"],
      orgRid: "org:acme",
      active: true,
    };

    expect(created).toEqual(expected);
    expect(await store.findByUsername("alice")).toEqual(expected);
    expect(await store.findByUsername("nobody")).toBeUndefined();
  });

  it("refuses a second user with the same username", async () => {
    const bob = { username: "bob", displayName: "Bob", passwordHash: "s:k", roles: [], orgRid: null };
    expect((await store.createUser(bob)).roles).toEqual([]);
    await expect(store.createUser(bob)).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it("sets a password and roles on an existing user only", async () => {
    await store.createUser({
      username: "carol", displayName: "Carol", passwordHash: "old:hash", roles: [], orgRid: null,
    });

    expect(await store.setPassword("carol", "new:hash")).toBe(true);
    expect(await store.setRoles("carol", ["ADMIN", "SERVICE_ACCOUNT"])).toBe(true);
    expect(await store.findByUsername("carol")).toMatchObject({
      passwordHash: "new:hash",
      roles: ["ADMIN", "SERVICE_ACCOUNT"],
    });

    expect(await store.setPassword("nobody", "x:y")).toBe(false);
    expect(await store.setRoles("nobody", ["ADMIN"])).toBe(false);
  });

  it("reads a user another service created without a password or roles", async () => {
    await pool.query(
      "INSERT INTO users (rid, username, display_name) VALUES ('ri.user.dave', 'dave', NULL)",
    );

    expect(await store.findByUsername("dave")).toEqual({
      username: "dave",
      displayName: "dave",
      passwordHash: null,
      roles: [],
      orgRid: null,
      active: true,
    });
  });
});
