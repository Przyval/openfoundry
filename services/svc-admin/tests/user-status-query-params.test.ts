/**
 * Behaviour of `include` and `status` on the admin user endpoints.
 *
 * Foundry's `UserStatus` is `ACTIVE` or `DELETED`, while OpenFoundry stores
 * `ACTIVE`, `INACTIVE` or `SUSPENDED`. Deleting a user here sets `INACTIVE`, so
 * `DELETED` addresses that state on the wire.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { UserStore } from "../src/store/user-store.js";
import { GroupStore } from "../src/store/group-store.js";

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

let app: FastifyInstance;
let userStore: UserStore;
let groupStore: GroupStore;

let activeRid: string;
let deletedRid: string;

beforeEach(async () => {
  userStore = new UserStore(false);
  groupStore = new GroupStore();
  app = await createServer({ config: TEST_CONFIG, userStore, groupStore });

  activeRid = userStore.createUser({
    username: "alice",
    email: "alice@example.com",
    displayName: "Alice",
  }).rid;

  deletedRid = userStore.createUser({
    username: "bob",
    email: "bob@example.com",
    displayName: "Bob",
  }).rid;
  userStore.deleteUser(deletedRid);
});

// ===========================================================================
// GET /admin/users
// ===========================================================================

describe("List users — include", () => {
  it("returns only active users when include=ACTIVE", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users?include=ACTIVE",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((u: any) => u.rid)).toEqual([activeRid]);
  });

  it("returns only deleted users when include=DELETED", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users?include=DELETED",
    });

    expect(res.json().data.map((u: any) => u.rid)).toEqual([deletedRid]);
  });

  it("returns every user when include is omitted", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users",
    });

    expect(res.json().data.map((u: any) => u.rid).sort()).toEqual(
      [activeRid, deletedRid].sort(),
    );
  });

  it("rejects a status outside the Foundry vocabulary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/admin/users?include=SUSPENDED",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe("INVALID_ARGUMENT");
  });
});

// ===========================================================================
// GET /admin/users/{userId}
// ===========================================================================

describe("Get user — status", () => {
  it("returns the user when the asserted status matches", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${activeRid}?status=ACTIVE`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().rid).toBe(activeRid);
  });

  it("answers UserDeleted when an active read finds a deleted user", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${deletedRid}?status=ACTIVE`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("UserDeleted");
  });

  it("answers UserIsActive when a deleted read finds an active user", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${activeRid}?status=DELETED`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).toBe("UserIsActive");
  });

  it("returns the user in either state when status is omitted", async () => {
    for (const rid of [activeRid, deletedRid]) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v2/admin/users/${rid}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().rid).toBe(rid);
    }
  });

  it("rejects a status outside the Foundry vocabulary", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${activeRid}?status=INACTIVE`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe("INVALID_ARGUMENT");
  });
});

// ===========================================================================
// SUSPENDED — a state Foundry's two-value UserStatus cannot name
// ===========================================================================

describe("Suspended users", () => {
  /** Creates a suspended user and returns its rid. */
  function suspendedUser(): string {
    const rid = userStore.createUser({
      username: "carol",
      email: "carol@example.com",
      displayName: "Carol",
    }).rid;
    userStore.updateUser(rid, { status: "SUSPENDED" });
    return rid;
  }

  it("does not call a suspended user deleted when status=ACTIVE is asserted", async () => {
    const rid = suspendedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${rid}?status=ACTIVE`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).not.toBe("UserDeleted");
    expect(res.json().errorName).toBe("UserSuspended");
  });

  it("does not call a suspended user active when status=DELETED is asserted", async () => {
    const rid = suspendedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${rid}?status=DELETED`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().errorName).not.toBe("UserIsActive");
    expect(res.json().errorName).toBe("UserSuspended");
  });

  it("still reports a genuinely deleted user as deleted", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${deletedRid}?status=ACTIVE`,
    });

    expect(res.json().errorName).toBe("UserDeleted");
  });

  it("still reports a genuinely active user as active", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${activeRid}?status=DELETED`,
    });

    expect(res.json().errorName).toBe("UserIsActive");
  });

  it("returns the suspended user when status is omitted", async () => {
    const rid = suspendedUser();
    const res = await app.inject({
      method: "GET",
      url: `/api/v2/admin/users/${rid}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("SUSPENDED");
  });

  it("excludes a suspended user from both include values but lists it unfiltered", async () => {
    const rid = suspendedUser();
    const rids = async (query: string) =>
      (
        await app.inject({ method: "GET", url: `/api/v2/admin/users${query}` })
      ).json().data.map((u: any) => u.rid);

    expect(await rids("?include=ACTIVE")).not.toContain(rid);
    expect(await rids("?include=DELETED")).not.toContain(rid);
    expect(await rids("")).toContain(rid);
  });
});
