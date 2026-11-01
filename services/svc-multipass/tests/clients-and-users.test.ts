import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type pg from "pg";
import { parseDeclaredClients } from "../src/store/client-store.js";
import {
  authenticate,
  canonicalRoles,
  createUserDirectory,
  InMemoryUserDirectory,
  isValidUsername,
} from "../src/store/user-store.js";
import { PgUserStore } from "../src/store/pg-user-store.js";
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
      JSON.stringify([{ clientId: "sync", clientSecret: "s3cret", roles: ["editor"] }]),
    );
    expect(client).toMatchObject({
      clientId: "sync",
      clientSecret: "s3cret",
      isPublic: false,
      grantTypes: ["client_credentials"],
      redirectUris: [],
      roles: ["EDITOR"],
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
    expect(canonicalRoles(["admin", " Editor ", "ADMIN", ""])).toEqual(["ADMIN", "EDITOR"]);
    expect(() => canonicalRoles(["platform-admin"])).toThrow(/unknown role/);
  });
});

describe("authenticate", () => {
  it("returns the stored record, whatever case the username was typed in", async () => {
    const directory = new InMemoryUserDirectory([await user("Alice", "pw-alice-1", { roles: ["VIEWER"] })]);
    const found = await authenticate(directory, "alice", "pw-alice-1");
    expect(found?.username).toBe("Alice");
    expect(found?.roles).toEqual(["VIEWER"]);
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

/** Records every statement and answers with canned rows. */
class FakePool {
  readonly statements: { text: string; values?: unknown[] }[] = [];

  constructor(private readonly rows: Record<string, unknown>[]) {}

  async query(config: { text: string; values?: unknown[] }) {
    this.statements.push(config);
    return { rows: this.rows, rowCount: this.rows.length };
  }
}

const ROW = {
  username: "alice",
  display_name: "Alice A.",
  password_hash: "salt:key",
  platform_roles: ["EDITOR"],
  org_rid: "org:acme",
  is_active: true,
};

describe("PgUserStore", () => {
  it("maps a users row to a record", async () => {
    const pool = new FakePool([ROW]);
    const record = await new PgUserStore(pool as unknown as pg.Pool).findByUsername("alice");

    expect(record).toEqual({
      username: "alice",
      displayName: "Alice A.",
      passwordHash: "salt:key",
      roles: ["EDITOR"],
      orgRid: "org:acme",
      active: true,
    });
    expect(pool.statements[0]!.values).toEqual(["alice"]);
  });

  it("names only columns that both schema sources give the users table", async () => {
    const pool = new FakePool([ROW]);
    const store = new PgUserStore(pool as unknown as pg.Pool);
    await store.findByUsername("alice");
    await store.createUser({
      username: "alice",
      displayName: "Alice",
      passwordHash: "salt:key",
      roles: ["EDITOR"],
      orgRid: null,
    });
    await store.setPassword("alice", "salt:key2");
    await store.setRoles("alice", ["VIEWER"]);

    const columns = [
      "rid", "username", "display_name", "password_hash", "platform_roles", "org_rid", "is_active",
    ];
    const sql = pool.statements.map((s) => s.text).join("\n");
    for (const column of columns) expect(sql).toContain(column);

    const migrations = readdirSync(path.join(REPO_ROOT, "db/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(path.join(REPO_ROOT, "db/migrations", f), "utf8"))
      .join("\n");
    const composeSchema = readFileSync(path.join(REPO_ROOT, "scripts/migrate.sql"), "utf8");

    for (const [name, schema] of [["db/migrations", migrations], ["scripts/migrate.sql", composeSchema]]) {
      const usersTable = schema.slice(schema.search(/CREATE TABLE (IF NOT EXISTS )?users \(/));
      const declared = usersTable.slice(0, usersTable.indexOf(");"));
      for (const column of columns) {
        const added = new RegExp(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column}\\b`).test(schema);
        expect(
          new RegExp(`^\\s+${column}\\s`, "m").test(declared) || added,
          `${name} gives users no ${column} column`,
        ).toBe(true);
      }
    }
  });
});
