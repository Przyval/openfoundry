import type { FastifyInstance } from "fastify";
import type { UserStore, StoredUser } from "../../store/user-store.js";
import type { GroupStore } from "../../store/group-store.js";
import { requirePermission } from "@openfoundry/permissions";
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
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/admin/users", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const all = userStore.listUsers().map(serializeUser);
    return paginateArray(all, request.query);
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
  }>("/admin/users/:userRid", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const user = userStore.getUser(request.params.userRid);
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
