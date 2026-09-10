import type { FastifyInstance } from "fastify";
import type { UserStore, StoredUser } from "../../store/user-store.js";
import type { GroupStore } from "../../store/group-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { customClient, invalidArgument } from "@openfoundry/errors";
import { paginateArray } from "./pagination-helpers.js";

/** Serialize a StoredUser to the wire format. */
function serializeUser(u: StoredUser) {
  return {
    rid: u.rid,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    attributes: u.attributes,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/** Serialize a group to wire format (without Set). */
function serializeGroup(g: { rid: string; name: string; description?: string; createdAt: string; updatedAt: string }) {
  return {
    rid: g.rid,
    name: g.name,
    description: g.description,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

/**
 * The user lifecycle states Foundry exposes on the wire.
 *
 * OpenFoundry tracks a wider `UserStatus` internally — `ACTIVE`, `INACTIVE`
 * and `SUSPENDED` — while Foundry's `UserStatus` is only `ACTIVE` or
 * `DELETED`. Deleting a user here sets `INACTIVE` (see `UserStore.deleteUser`),
 * so `INACTIVE` is what `DELETED` names on the wire; `SUSPENDED` is neither.
 */
const FOUNDRY_USER_STATUSES = ["ACTIVE", "DELETED"] as const;
type FoundryUserStatus = (typeof FOUNDRY_USER_STATUSES)[number];

function parseUserStatus(
  param: string,
  raw: string | undefined,
): FoundryUserStatus | undefined {
  if (raw === undefined || raw === "") return undefined;
  if ((FOUNDRY_USER_STATUSES as readonly string[]).includes(raw)) {
    return raw as FoundryUserStatus;
  }
  throw invalidArgument(
    param,
    `must be one of ${FOUNDRY_USER_STATUSES.join(", ")}, got "${raw}"`,
  );
}

/**
 * Whether a stored user is in the requested Foundry lifecycle state.
 *
 * A `SUSPENDED` user matches neither: it is genuinely not active and it has
 * not been deleted, so it is excluded from both `include=ACTIVE` and
 * `include=DELETED` rather than being counted under a state it is not in.
 * Omitting `include` still lists it.
 */
function matchesStatus(user: StoredUser, status: FoundryUserStatus): boolean {
  return status === "ACTIVE" ? user.status === "ACTIVE" : user.status === "INACTIVE";
}

/**
 * The error for a user who is not in the asserted lifecycle state.
 *
 * Named from the state the user is actually in, never from the one that was
 * asked for: a suspended user is neither deleted nor active, so answering
 * either of those names would tell the caller something untrue about the
 * account.
 */
function statusMismatchError(user: StoredUser) {
  switch (user.status) {
    case "INACTIVE":
      return customClient(400, "UserDeleted", "The user is deleted.");
    case "ACTIVE":
      return customClient(400, "UserIsActive", "The user is an active user.");
    default:
      return customClient(400, "UserSuspended", "The user is suspended.");
  }
}

export async function userRoutes(
  app: FastifyInstance,
  opts: { userStore: UserStore; groupStore: GroupStore },
): Promise<void> {
  const { userStore, groupStore } = opts;

  // Search users (must be before :userRid to avoid conflicts)
  app.get<{
    Querystring: { q: string };
  }>("/admin/users/search", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const results = userStore.searchUsers(request.query.q);
    return results.map(serializeUser);
  });

  // List users (paginated)
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string; include?: string };
  }>("/admin/users", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    // `include` narrows the listing to one lifecycle state. Omitting it keeps
    // the endpoint's existing behaviour of listing users in every state.
    const include = parseUserStatus("include", request.query.include);
    const users = include
      ? userStore.listUsers().filter((u) => matchesStatus(u, include))
      : userStore.listUsers();
    return paginateArray(users.map(serializeUser), request.query);
  });

  // Create user
  app.post<{
    Body: {
      username: string;
      email: string;
      displayName: string;
      attributes?: Record<string, string>;
    };
  }>("/admin/users", {
    preHandler: requirePermission("admin:manage"),
  }, async (request, reply) => {
    const user = userStore.createUser(request.body);
    reply.status(201);
    return serializeUser(user);
  });

  // Get user by RID
  app.get<{
    Params: { userRid: string };
    Querystring: { status?: string };
  }>("/admin/users/:userRid", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    // `status` asserts which lifecycle state the caller expects the user to be
    // in. Foundry answers a mismatch with an error naming the state the user
    // is actually in rather than the user record. Omitting it returns the user
    // either way, which is what this endpoint has always done.
    const status = parseUserStatus("status", request.query.status);
    const user = userStore.getUser(request.params.userRid);

    if (status !== undefined && !matchesStatus(user, status)) {
      throw statusMismatchError(user);
    }

    return serializeUser(user);
  });

  // Update user
  app.put<{
    Params: { userRid: string };
    Body: {
      email?: string;
      displayName?: string;
      attributes?: Record<string, string>;
      status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    };
  }>("/admin/users/:userRid", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const user = userStore.updateUser(request.params.userRid, request.body);
    return serializeUser(user);
  });

  // Delete user (set inactive)
  app.delete<{
    Params: { userRid: string };
  }>("/admin/users/:userRid", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const user = userStore.deleteUser(request.params.userRid);
    return serializeUser(user);
  });

  // List user's groups
  app.get<{
    Params: { userRid: string };
  }>("/admin/users/:userRid/groups", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    // Verify user exists
    userStore.getUser(request.params.userRid);
    const groups = groupStore.getGroupsForUser(request.params.userRid);
    return groups.map(serializeGroup);
  });
}
