import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { FileAuthorizationStore, LEGACY_ROLE_GRANT_SOURCE, ROOT_RESOURCE, setEnforcePermissions } from "@openfoundry/permissions";
import { createServer } from "../src/server.js";
import { UserStore } from "../src/store/user-store.js";
import { GroupStore } from "../src/store/group-store.js";

const RESOURCE = "ri.ontology.main.ontology.alpha";
const as = (userId: string, extra: Record<string, string> = {}) => ({ "x-user-id": userId, ...extra });
const admin = as("root", { "x-user-platform-admin": "true" });
const base = `/api/v2/admin/resources/${RESOURCE}`;

let app: FastifyInstance;
let authz: FileAuthorizationStore;

beforeEach(async () => {
  authz = new FileAuthorizationStore(null);
  app = await createServer({
    config: { port: 0, host: "127.0.0.1", logLevel: "silent", nodeEnv: "test" },
    userStore: new UserStore(false),
    groupStore: new GroupStore(),
    authorizationStore: authz,
  });
  setEnforcePermissions(true);
});

afterEach(() => {
  setEnforcePermissions(false);
});

const roles = (body: unknown) => ({ roles: body });

describe("who holds a role on a resource", () => {
  it("is managed by an Owner of the resource, through Foundry's roles/add and roles/remove", async () => {
    const add = await app.inject({
      method: "POST",
      url: `${base}/roles/add`,
      headers: admin,
      payload: roles([{ principalId: "vera", principalType: "USER", roleId: "viewer" }]),
    });
    expect(add.statusCode).toBe(204);

    const listed = await app.inject({ method: "GET", url: `${base}/roles`, headers: admin });
    expect(listed.json().data).toMatchObject([
      { roleId: "viewer", principalId: "vera", principalType: "USER", grantedBy: "root" },
    ]);

    const remove = await app.inject({
      method: "POST",
      url: `${base}/roles/remove`,
      headers: admin,
      payload: roles([{ principalId: "vera", principalType: "USER", roleId: "viewer" }]),
    });
    expect(remove.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `${base}/roles`, headers: admin })).json().data).toEqual([]);
  });

  it("cannot be changed by an Editor, a Viewer or a stranger", async () => {
    await authz.addGrant({ resourceRid: RESOURCE, principalType: "user", principalId: "eddie", roleId: "editor", grantedBy: "t", grantedAt: "2026-01-01T00:00:00.000Z" });
    const attempt = (who: string) =>
      app.inject({
        method: "POST",
        url: `${base}/roles/add`,
        headers: as(who),
        payload: roles([{ principalId: who, principalType: "USER", roleId: "owner" }]),
      });
    expect((await attempt("eddie")).statusCode).toBe(403);
    expect((await attempt("stranger")).statusCode).toBe(403);
    expect(await authz.listGrants(RESOURCE)).toHaveLength(1);
  });

  it("can be handed to a group, and an Owner on the resource may manage it without being an administrator", async () => {
    await authz.addGrant({ resourceRid: RESOURCE, principalType: "user", principalId: "olga", roleId: "owner", grantedBy: "t", grantedAt: "2026-01-01T00:00:00.000Z" });
    const res = await app.inject({
      method: "POST",
      url: `${base}/roles/add`,
      headers: as("olga"),
      payload: roles([{ principalId: "analysts", principalType: "GROUP", roleId: "viewer" }]),
    });
    expect(res.statusCode).toBe(204);
    expect(await authz.grantsFor([RESOURCE], [{ principalType: "group", principalId: "analysts" }])).toHaveLength(1);
  });

  it("takes over a grant made from a legacy role name, so its mapping can no longer revoke it", async () => {
    await authz.addGrant({ resourceRid: ROOT_RESOURCE, principalType: "user", principalId: "service:sync", roleId: "editor", grantedBy: LEGACY_ROLE_GRANT_SOURCE, grantedAt: "2026-01-01T00:00:00.000Z" });
    const root = `/api/v2/admin/resources/${ROOT_RESOURCE}/roles`;
    const add = await app.inject({
      method: "POST",
      url: `${root}/add`,
      headers: admin,
      payload: roles([{ principalId: "service:sync", principalType: "USER", roleId: "editor" }]),
    });
    expect(add.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: root, headers: admin })).json().data).toMatchObject([
      { principalId: "service:sync", roleId: "editor", grantedBy: "root" },
    ]);
  });

  it("rejects a role Foundry does not define", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${base}/roles/add`,
      headers: admin,
      payload: roles([{ principalId: "vera", principalType: "USER", roleId: "superuser" }]),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("the roles themselves", () => {
  it("are platform-defined: listed, never created or deleted", async () => {
    const list = await app.inject({ method: "GET", url: "/api/v2/admin/roles", headers: admin });
    expect(list.statusCode).toBe(200);
    expect((list.json().data as Array<{ id: string }>).map((r) => r.id)).toEqual(["owner", "editor", "viewer", "discoverer"]);

    expect((await app.inject({ method: "GET", url: "/api/v2/admin/roles/viewer", headers: admin })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v2/admin/roles/nope", headers: admin })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/v2/admin/roles", headers: admin, payload: { name: "x" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/api/v2/admin/roles/viewer", headers: admin })).statusCode).toBe(404);
  });
});

describe("Organizations and Markings on a resource", () => {
  it("are set by an Owner and read back", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `${base}/policy`,
      headers: admin,
      payload: { organizations: ["org-a"], markings: ["pii"] },
    });
    expect(put.statusCode).toBe(200);
    const member = { ...admin, "x-user-org": "org-a", "x-user-markings": "pii" };
    expect((await app.inject({ method: "GET", url: `${base}/policy`, headers: member })).json()).toEqual({
      organizations: ["org-a"],
      markings: ["pii"],
    });
  });

  it("bind an Owner, but a platform administrator can still reset a policy nobody satisfies", async () => {
    await authz.addGrant({ resourceRid: RESOURCE, principalType: "user", principalId: "olga", roleId: "owner", grantedBy: "t", grantedAt: "2026-01-01T00:00:00.000Z" });
    await authz.setPolicy({ resourceRid: RESOURCE, organizations: [], markings: ["nobody-holds-this"] });

    // The Marking locks out the resource's own Owner, and the administrator everywhere else.
    expect((await app.inject({ method: "GET", url: `${base}/policy`, headers: as("olga") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `${base}/roles`, headers: admin })).statusCode).toBe(403);

    // The way back: the administrator reads and replaces the policy.
    expect((await app.inject({ method: "GET", url: `${base}/policy`, headers: admin })).json()).toEqual({
      organizations: [],
      markings: ["nobody-holds-this"],
    });
    const reset = await app.inject({ method: "PUT", url: `${base}/policy`, headers: admin, payload: { markings: [] } });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `${base}/policy`, headers: as("olga") })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `${base}/roles`, headers: admin })).statusCode).toBe(200);
  });

  it("cannot be set by a Viewer", async () => {
    await authz.addGrant({ resourceRid: RESOURCE, principalType: "user", principalId: "vera", roleId: "viewer", grantedBy: "t", grantedAt: "2026-01-01T00:00:00.000Z" });
    const res = await app.inject({ method: "PUT", url: `${base}/policy`, headers: as("vera"), payload: { markings: [] } });
    expect(res.statusCode).toBe(403);
  });

  it("make the platform root manageable only by a platform administrator or its Owner", async () => {
    const root = `/api/v2/admin/resources/${ROOT_RESOURCE}/roles`;
    expect((await app.inject({ method: "GET", url: root, headers: as("vera") })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: root, headers: admin })).statusCode).toBe(200);
  });
});
