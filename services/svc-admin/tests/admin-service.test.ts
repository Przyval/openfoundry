import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { UserStore } from "../src/store/user-store.js";
import { GroupStore } from "../src/store/group-store.js";
import { setEnforcePermissions } from "@openfoundry/permissions";

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
  userStore = new UserStore();
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
