import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { createServer } from "../src/server.js";
import { UserStore } from "../src/store/user-store.js";
import { GroupStore } from "../src/store/group-store.js";
import type {
  AuditLogEntry,
  AuditQuery,
  AuditStore,
} from "../src/store/audit-store.js";
import { PgAuditStore } from "../src/store/pg-audit-store.js";
import { setEnforcePermissions } from "@openfoundry/permissions";
import { notFound } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

/** Headers that grant full ADMIN access. */
const ADMIN_HEADERS = {
  "x-user-id": "test-admin",
  "x-user-roles": "ADMIN",
};

/** Headers that grant read-only VIEWER access. */
const VIEWER_HEADERS = {
  "x-user-id": "test-viewer",
  "x-user-roles": "VIEWER",
};

let app: FastifyInstance;
let userStore: UserStore;
let groupStore: GroupStore;

beforeEach(async () => {
  userStore = new UserStore(false);
  groupStore = new GroupStore();
  app = await createServer({ config: TEST_CONFIG, userStore, groupStore });
});

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

describe("Health endpoints", () => {
  it("GET /status/health returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });
});

// -------------------------------------------------------------------------
// User CRUD
// -------------------------------------------------------------------------

describe("User CRUD", () => {
  it("POST /api/v2/admin/users creates a user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "jdoe",
        email: "jdoe@example.com",
        displayName: "John Doe",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.username).toBe("jdoe");
    expect(body.status).toBe("ACTIVE");
    expect(body.rid).toMatch(/^ri\./);
  });

  it("GET /api/v2/admin/users lists users", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: { username: "user-a", email: "a@test.com", displayName: "A" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: { username: "user-b", email: "b@test.com", displayName: "B" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET /api/v2/admin/users supports pagination", async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "POST",
        url: "/api/v2/admin/users",
        payload: {
          username: `user-${i}`,
          email: `user${i}@test.com`,
          displayName: `User ${i}`,
        },
      });
    }

    const page1 = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users?pageSize=2",
    });
    const body1 = page1.json();
    expect(body1.data).toHaveLength(2);
    expect(body1.nextPageToken).toBeDefined();
  });

  it("GET /api/v2/admin/users/:rid returns a specific user", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "jdoe",
        email: "jdoe@example.com",
        displayName: "John Doe",
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe("jdoe");
  });

  it("PUT /api/v2/admin/users/:rid updates a user", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "jdoe",
        email: "jdoe@example.com",
        displayName: "John Doe",
      },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v2/admin/users/${rid}`,
      payload: { displayName: "Jonathan Doe", status: "SUSPENDED" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe("Jonathan Doe");
    expect(res.json().status).toBe("SUSPENDED");
  });

  it("DELETE /api/v2/admin/users/:rid sets user to INACTIVE", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "jdoe",
        email: "jdoe@example.com",
        displayName: "John Doe",
      },
    });
    const rid = createRes.json().rid;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/admin/users/${rid}`,
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().status).toBe("INACTIVE");

    // User still accessible but inactive
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${rid}`,
    });
    expect(getRes.json().status).toBe("INACTIVE");
  });

  it("GET returns 404 for unknown user RID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users/ri.multipass.main.user.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST returns 409 for duplicate username", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "jdoe",
        email: "jdoe@example.com",
        displayName: "John",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "jdoe",
        email: "other@example.com",
        displayName: "Other John",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("POST returns 409 for duplicate email", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "user1",
        email: "shared@example.com",
        displayName: "User 1",
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "user2",
        email: "shared@example.com",
        displayName: "User 2",
      },
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// User Search
// -------------------------------------------------------------------------

describe("User Search", () => {
  it("searches users by username", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: { username: "alice", email: "alice@test.com", displayName: "Alice" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: { username: "bob", email: "bob@test.com", displayName: "Bob" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users/search?q=alice",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].username).toBe("alice");
  });

  it("searches users by email", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "charlie",
        email: "charlie@bigcorp.com",
        displayName: "Charlie",
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users/search?q=bigcorp",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------
// Group CRUD
// -------------------------------------------------------------------------

describe("Group CRUD", () => {
  it("POST /api/v2/admin/groups creates a group", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "admins", description: "Admin group" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("admins");
    expect(body.rid).toMatch(/^ri\./);
  });

  it("GET /api/v2/admin/groups lists groups", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "group-a" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "group-b" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/groups",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
  });

  it("GET /api/v2/admin/groups/:rid returns a specific group", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "eng-team" },
    });
    const rid = createRes.json().rid;

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${rid}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("eng-team");
  });

  it("DELETE /api/v2/admin/groups/:rid deletes a group", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "temp-group" },
    });
    const rid = createRes.json().rid;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/admin/groups/${rid}`,
    });
    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${rid}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("POST returns 409 for duplicate group name", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "dup-group" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "dup-group" },
    });
    expect(res.statusCode).toBe(409);
  });
});

// -------------------------------------------------------------------------
// Membership
// -------------------------------------------------------------------------

describe("Membership", () => {
  let userRid: string;
  let groupRid: string;

  beforeEach(async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "member-user",
        email: "member@test.com",
        displayName: "Member",
      },
    });
    userRid = userRes.json().rid;

    const groupRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "test-group" },
    });
    groupRid = groupRes.json().rid;
  });

  it("POST adds a member to a group", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().userRid).toBe(userRid);
  });

  it("GET lists members of a group", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/members`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].rid).toBe(userRid);
  });

  it("DELETE removes a member from a group", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid },
    });

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/admin/groups/${groupRid}/members/${userRid}`,
    });
    expect(delRes.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/members`,
    });
    expect(listRes.json()).toHaveLength(0);
  });

  it("POST returns 409 for duplicate member", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid },
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid },
    });
    expect(res.statusCode).toBe(409);
  });

  it("GET lists groups for a user", async () => {
    // Add user to two groups
    const group2Res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "second-group" },
    });
    const group2Rid = group2Res.json().rid;

    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid },
    });
    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${group2Rid}/members`,
      payload: { userRid },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${userRid}/groups`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  it("DELETE member returns 404 for non-member", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v2/admin/groups/${groupRid}/members/${userRid}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("deleting a group removes all memberships", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid },
    });

    // Delete the group
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/admin/groups/${groupRid}`,
    });
    expect(delRes.statusCode).toBe(204);

    // User should have no groups now
    const groupsRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${userRid}/groups`,
    });
    expect(groupsRes.json()).toHaveLength(0);
  });

  it("adding member with nonexistent user returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/members`,
      payload: { userRid: "ri.multipass.main.user.nonexistent" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// -------------------------------------------------------------------------
// Permission enforcement
// -------------------------------------------------------------------------

describe("Permission enforcement", () => {
  beforeEach(() => {
    setEnforcePermissions(true);
  });

  afterEach(() => {
    setEnforcePermissions(false);
  });

  it("allows ADMIN to list users", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
      headers: ADMIN_HEADERS,
    });
    expect(res.statusCode).toBe(200);
  });

  it("denies VIEWER from listing users (admin:manage required)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
      headers: VIEWER_HEADERS,
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies VIEWER from creating users (admin:manage required)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      headers: VIEWER_HEADERS,
      payload: {
        username: "denied",
        email: "denied@test.com",
        displayName: "Denied",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies EDITOR from admin operations (admin:manage required)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
      headers: {
        "x-user-id": "test-editor",
        "x-user-roles": "EDITOR",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies requests with no identity when enforcement is enabled", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
    });
    expect(res.statusCode).toBe(403);
  });
});

// -------------------------------------------------------------------------
// Membership against asynchronous (database-backed) stores
// -------------------------------------------------------------------------

describe("Membership with async stores", () => {
  let asyncApp: FastifyInstance;

  const user = {
    rid: "ri.multipass.main.user.1",
    username: "async-user",
    email: "async@test.com",
    displayName: "Async User",
    attributes: {},
    status: "ACTIVE" as const,
    createdAt: "2026-09-11T12:00:00.000Z",
    updatedAt: "2026-09-11T12:00:00.000Z",
  };

  beforeEach(async () => {
    // The Pg stores expose the same methods as their in-memory counterparts
    // but return promises; routes must await them in both modes.
    const asyncUserStore = {
      getUser: (rid: string) =>
        rid === user.rid
          ? Promise.resolve(user)
          : Promise.reject(notFound("User", rid)),
    } as unknown as UserStore;
    const asyncGroupStore = {
      getMembers: () => Promise.resolve([user.rid]),
    } as unknown as GroupStore;

    asyncApp = await createServer({
      config: TEST_CONFIG,
      userStore: asyncUserStore,
      groupStore: asyncGroupStore,
    });
  });

  afterEach(async () => {
    await asyncApp.close();
  });

  it("GET members resolves each member into a full user record", async () => {
    const res = await asyncApp.inject({
      method: "GET",
      url: "/api/v2/admin/groups/ri.multipass.main.group.1/members",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        rid: user.rid,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
      },
    ]);
  });
});

// -------------------------------------------------------------------------
// Group members (Foundry `admin.GroupMember` contract)
// -------------------------------------------------------------------------

describe("Group members", () => {
  let userRid: string;
  let groupRid: string;

  beforeEach(async () => {
    const userRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "gm-user",
        email: "gm@test.com",
        displayName: "Group Member",
      },
    });
    userRid = userRes.json().rid;

    const groupRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups",
      payload: { name: "gm-group" },
    });
    groupRid = groupRes.json().rid;
  });

  it("serializes a group with Foundry's `id` as well as `rid`", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/groups",
    });
    expect(res.statusCode).toBe(200);
    const group = res.json().data.find((g: { rid: string }) => g.rid === groupRid);
    expect(group.id).toBe(groupRid);
  });

  it("GET groupMembers returns an empty page for a fresh group", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });

  it("POST groupMembers/add adds a principal and GET lists it", async () => {
    const addRes = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: [userRid] },
    });
    expect(addRes.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers`,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data).toEqual([
      { principalType: "USER", principalId: userRid },
    ]);
  });

  it("POST groupMembers/add accepts several principals at once", async () => {
    const secondRes = await app.inject({
      method: "POST",
      url: "/api/v2/admin/users",
      payload: {
        username: "gm-user-2",
        email: "gm2@test.com",
        displayName: "Group Member 2",
      },
    });
    const secondRid = secondRes.json().rid;

    const addRes = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: [userRid, secondRid] },
    });
    expect(addRes.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers`,
    });
    expect(
      listRes.json().data.map((m: { principalId: string }) => m.principalId),
    ).toEqual([userRid, secondRid]);
  });

  it("POST groupMembers/remove removes a principal", async () => {
    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: [userRid] },
    });

    const removeRes = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/remove`,
      payload: { principalIds: [userRid] },
    });
    expect(removeRes.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers`,
    });
    expect(listRes.json().data).toEqual([]);
  });

  it("GET groupMembers paginates", async () => {
    const rids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v2/admin/users",
        payload: {
          username: `paged-user-${i}`,
          email: `paged${i}@test.com`,
          displayName: `Paged ${i}`,
        },
      });
      rids.push(res.json().rid);
    }
    await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: rids },
    });

    const firstPage = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers?pageSize=2`,
    });
    expect(firstPage.json().data).toHaveLength(2);
    const token = firstPage.json().nextPageToken;
    expect(token).toBeTruthy();

    const secondPage = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers?pageSize=2&pageToken=${token}`,
    });
    expect(secondPage.json().data).toHaveLength(1);
    expect(secondPage.json().nextPageToken).toBeUndefined();
  });

  it("POST groupMembers/add returns 404 for an unknown principal", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: ["ri.multipass.main.user.nope"] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("UserNotFound");
  });

  it("POST groupMembers/add is idempotent for a principal already in the group", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: [userRid] },
    });
    expect(first.statusCode).toBe(204);

    const second = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: [userRid] },
    });
    expect(second.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers`,
    });
    expect(
      listRes.json().data.map((m: { principalId: string }) => m.principalId),
    ).toEqual([userRid]);
  });

  it("POST groupMembers/add tolerates the same principal twice in one payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: [userRid, userRid] },
    });
    expect(res.statusCode).toBe(204);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers`,
    });
    expect(
      listRes.json().data.map((m: { principalId: string }) => m.principalId),
    ).toEqual([userRid]);
  });

  it("POST groupMembers/add adds nobody when one principal is unknown", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
      payload: { principalIds: [userRid, "ri.multipass.main.user.nope"] },
    });
    expect(res.statusCode).toBe(404);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers`,
    });
    expect(listRes.json().data).toEqual([]);
  });

  it("POST groupMembers/add rejects a malformed body with 400", async () => {
    for (const payload of [{}, { principalIds: null }, { principalIds: [""] }]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v2/admin/groups/${groupRid}/groupMembers/add`,
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().errorName).toBe("ValidationError");
    }
  });

  it("POST groupMembers/remove rejects a malformed body with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/remove`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("ValidationError");
  });

  it("POST groupMembers/remove returns GroupNotFound for an unknown group", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/admin/groups/ri.multipass.main.group.nope/groupMembers/remove",
      payload: { principalIds: [userRid] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("GroupNotFound");
  });

  it("POST groupMembers/remove returns 404 for a non-member", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v2/admin/groups/${groupRid}/groupMembers/remove`,
      payload: { principalIds: [userRid] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("GroupMemberNotFound");
  });

  it("GET groupMembers returns 404 for an unknown group", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/groups/ri.multipass.main.group.nope/groupMembers",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorName).toBe("GroupNotFound");
  });
});

// -------------------------------------------------------------------------
// Audit log
// -------------------------------------------------------------------------

/** Audit store that records the queries it receives and serves fixed rows. */
class RecordingAuditStore implements AuditStore {
  readonly available = true;
  readonly calls: AuditQuery[] = [];

  constructor(private readonly entries: AuditLogEntry[]) {}

  async listEntries(query: AuditQuery): Promise<AuditLogEntry[]> {
    this.calls.push(query);
    return this.entries.slice(query.offset, query.offset + query.limit);
  }
}

function auditEntry(id: number): AuditLogEntry {
  return {
    id: String(id),
    timestamp: `2026-09-1${id}T12:00:00.000Z`,
    user: `ri.multipass.main.user.${id}`,
    action: "object.create",
    resourceType: "OBJECT",
    resourceRid: `ri.objects.main.object.${id}`,
    details: '{"objectType":"Employee"}',
  };
}

describe("Audit log", () => {
  it("reports the trail as unavailable when the service has no database", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/audit",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [], available: false });
  });

  it("reports an empty trail as available when a store can hold entries", async () => {
    const auditApp = await createServer({
      config: TEST_CONFIG,
      userStore: new UserStore(false),
      groupStore: new GroupStore(),
      auditStore: new RecordingAuditStore([]),
    });

    const res = await auditApp.inject({
      method: "GET",
      url: "/api/v2/admin/audit",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [], available: true });

    await auditApp.close();
  });

  it("rejects a non-numeric pageSize with 400 rather than failing downstream", async () => {
    const store = new RecordingAuditStore([auditEntry(1)]);
    const auditApp = await createServer({
      config: TEST_CONFIG,
      userStore: new UserStore(false),
      groupStore: new GroupStore(),
      auditStore: store,
    });

    const res = await auditApp.inject({
      method: "GET",
      url: "/api/v2/admin/audit?pageSize=abc",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("ValidationError");
    // The store must never be asked for a NaN limit.
    expect(store.calls).toHaveLength(0);

    await auditApp.close();
  });

  it("returns audit entries as a page", async () => {
    const store = new RecordingAuditStore([auditEntry(1), auditEntry(2)]);
    const auditApp = await createServer({
      config: TEST_CONFIG,
      userStore: new UserStore(false),
      groupStore: new GroupStore(),
      auditStore: store,
    });

    const res = await auditApp.inject({
      method: "GET",
      url: "/api/v2/admin/audit",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([auditEntry(1), auditEntry(2)]);
    expect(res.json().nextPageToken).toBeUndefined();

    await auditApp.close();
  });

  it("forwards the console's filters to the store", async () => {
    const store = new RecordingAuditStore([]);
    const auditApp = await createServer({
      config: TEST_CONFIG,
      userStore: new UserStore(false),
      groupStore: new GroupStore(),
      auditStore: store,
    });

    await auditApp.inject({
      method: "GET",
      url:
        "/api/v2/admin/audit?action=CREATE&user=alice" +
        "&dateFrom=2026-09-01&dateTo=2026-09-30&pageSize=25",
    });

    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]).toMatchObject({
      action: "CREATE",
      user: "alice",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      offset: 0,
      // one more than the page size, so a next page can be detected
      limit: 26,
    });

    await auditApp.close();
  });

  it("pages through entries with nextPageToken", async () => {
    const store = new RecordingAuditStore([
      auditEntry(1),
      auditEntry(2),
      auditEntry(3),
    ]);
    const auditApp = await createServer({
      config: TEST_CONFIG,
      userStore: new UserStore(false),
      groupStore: new GroupStore(),
      auditStore: store,
    });

    const firstPage = await auditApp.inject({
      method: "GET",
      url: "/api/v2/admin/audit?pageSize=2",
    });
    expect(firstPage.json().data).toEqual([auditEntry(1), auditEntry(2)]);
    const token = firstPage.json().nextPageToken;
    expect(token).toBeTruthy();

    const secondPage = await auditApp.inject({
      method: "GET",
      url: `/api/v2/admin/audit?pageSize=2&pageToken=${token}`,
    });
    expect(secondPage.json().data).toEqual([auditEntry(3)]);
    expect(secondPage.json().nextPageToken).toBeUndefined();
    expect(store.calls[1].offset).toBe(2);

    await auditApp.close();
  });
});

// -------------------------------------------------------------------------
// PgAuditStore SQL
// -------------------------------------------------------------------------

describe("PgAuditStore", () => {
  /** Minimal pool stub that captures the query it is handed. */
  function fakePool() {
    const captured: { text?: string; values?: unknown[] } = {};
    const pool = {
      query(config: { text: string; values: unknown[] }) {
        captured.text = config.text;
        captured.values = config.values;
        return Promise.resolve({ rows: [] });
      },
    };
    return { pool, captured };
  }

  it("builds an unfiltered query with LIMIT/OFFSET", async () => {
    const { pool, captured } = fakePool();
    const store = new PgAuditStore(pool as unknown as pg.Pool);

    await store.listEntries({ offset: 10, limit: 26 });

    expect(captured.text).not.toContain("WHERE");
    expect(captured.text).toContain("ORDER BY timestamp DESC");
    expect(captured.values).toEqual([26, 10]);
  });

  it("binds every filter as a parameter", async () => {
    const { pool, captured } = fakePool();
    const store = new PgAuditStore(pool as unknown as pg.Pool);

    await store.listEntries({
      action: "CREATE",
      user: "alice",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      offset: 0,
      limit: 11,
    });

    expect(captured.values).toEqual([
      "CREATE",
      "%alice%",
      "2026-09-01",
      "2026-09-30",
      11,
      0,
    ]);
    // The action filter matches both the dotted form written by
    // `writeAuditLog` and the bare verb written by `AuditLogger`.
    expect(captured.text).toContain("split_part(action, '.', 2)");
    // `dateTo` is a calendar day and must include that whole day.
    expect(captured.text).toContain("INTERVAL '1 day'");
    // No filter value may ever be interpolated into the SQL text.
    expect(captured.text).not.toContain("alice");
  });

  it("matches the user filter against the RID as well as the principal's names", async () => {
    const { pool, captured } = fakePool();
    const store = new PgAuditStore(pool as unknown as pg.Pool);

    await store.listEntries({ user: "Admin", offset: 0, limit: 11 });

    // The value is bound once, as a contains-pattern.
    expect(captured.values).toEqual(["%Admin%", 11, 0]);
    expect(captured.text).not.toContain("Admin");
    // Neither the RID nor the name match may be case-sensitive.
    expect(captured.text).toContain("user_rid ILIKE $1");
    expect(captured.text).toContain("username ILIKE $1");
  });

  it("escapes LIKE wildcards in the user filter", async () => {
    const { pool, captured } = fakePool();
    const store = new PgAuditStore(pool as unknown as pg.Pool);

    await store.listEntries({ user: "100%_x", offset: 0, limit: 11 });

    expect(captured.values?.[0]).toBe("%100\\%\\_x%");
  });

  it("maps a row onto the console's audit entry shape", async () => {
    const store = new PgAuditStore({
      query: () =>
        Promise.resolve({
          rows: [
            {
              id: 7,
              timestamp: new Date("2026-09-11T12:00:00.000Z"),
              user_rid: "ri.multipass.main.user.1",
              action: "object.create",
              resource_rid: "ri.objects.main.object.1",
              resource_type: "OBJECT",
              details: '{"objectType":"Employee"}',
            },
          ],
        }),
    } as unknown as pg.Pool);

    const entries = await store.listEntries({ offset: 0, limit: 11 });
    expect(entries).toEqual([
      {
        id: "7",
        timestamp: "2026-09-11T12:00:00.000Z",
        user: "ri.multipass.main.user.1",
        action: "object.create",
        resourceType: "OBJECT",
        resourceRid: "ri.objects.main.object.1",
        details: '{"objectType":"Employee"}',
      },
    ]);
  });

  it("omits details when the row has none", async () => {
    const store = new PgAuditStore({
      query: () =>
        Promise.resolve({
          rows: [
            {
              id: 8,
              timestamp: "2026-09-11T12:00:00.000Z",
              user_rid: null,
              action: "user.login",
              resource_rid: null,
              resource_type: null,
              details: null,
            },
          ],
        }),
    } as unknown as pg.Pool);

    const entries = await store.listEntries({ offset: 0, limit: 11 });
    expect(entries[0]).toEqual({
      id: "8",
      timestamp: "2026-09-11T12:00:00.000Z",
      user: "",
      action: "user.login",
      resourceType: "",
      resourceRid: "",
    });
  });
});
