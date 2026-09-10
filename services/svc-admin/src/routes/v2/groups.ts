import type { FastifyInstance } from "fastify";
import type { GroupStore, StoredGroup } from "../../store/group-store.js";
import type { UserStore } from "../../store/user-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

/** Serialize a StoredGroup to the wire format. */
function serializeGroup(g: StoredGroup) {
  return {
    // Foundry's Group model identifies a group by `id`; `rid` is OpenFoundry's
    // own name for the same value and is kept for existing callers.
    id: g.rid,
    rid: g.rid,
    name: g.name,
    description: g.description,
    memberCount: g.members.size,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export async function groupRoutes(
  app: FastifyInstance,
  opts: { groupStore: GroupStore; userStore: UserStore },
): Promise<void> {
  const { groupStore, userStore } = opts;

  // List groups (paginated)
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/admin/groups", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const all = groupStore.listGroups().map(serializeGroup);
    return paginateArray(all, request.query);
  });

  // Create group
  app.post<{
    Body: { name: string; description?: string };
  }>("/admin/groups", {
    preHandler: requirePermission("admin:manage"),
  }, async (request, reply) => {
    const group = groupStore.createGroup(request.body);
    reply.status(201);
    return serializeGroup(group);
  });

  // Get group by RID
  app.get<{
    Params: { groupRid: string };
  }>("/admin/groups/:groupRid", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const group = groupStore.getGroup(request.params.groupRid);
    return serializeGroup(group);
  });

  // Delete group
  app.delete<{
    Params: { groupRid: string };
  }>("/admin/groups/:groupRid", {
    preHandler: requirePermission("admin:manage"),
  }, async (request, reply) => {
    groupStore.deleteGroup(request.params.groupRid);
    reply.status(204);
    return;
  });

  // Add member to group
  app.post<{
    Params: { groupRid: string };
    Body: { userRid: string };
  }>("/admin/groups/:groupRid/members", {
    preHandler: requirePermission("admin:manage"),
  }, async (request, reply) => {
    // Verify user exists
    userStore.getUser(request.body.userRid);
    groupStore.addMember(request.params.groupRid, request.body.userRid);
    reply.status(201);
    return { groupRid: request.params.groupRid, userRid: request.body.userRid };
  });

  // Remove member from group
  app.delete<{
    Params: { groupRid: string; userRid: string };
  }>("/admin/groups/:groupRid/members/:userRid", {
    preHandler: requirePermission("admin:manage"),
  }, async (request, reply) => {
    groupStore.removeMember(request.params.groupRid, request.params.userRid);
    reply.status(204);
    return;
  });

  // List members of a group
  app.get<{
    Params: { groupRid: string };
  }>("/admin/groups/:groupRid/members", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const memberRids = await groupStore.getMembers(request.params.groupRid);
    const members = memberRids.map((rid) => {
      const user = userStore.getUser(rid);
      return {
        rid: user.rid,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        status: user.status,
      };
    });
    return members;
  });

  // -----------------------------------------------------------------------
  // Group members - the Foundry `admin.GroupMember` resource
  //
  // Foundry names this sub-resource `groupMembers` and mutates it with
  // `add` / `remove` actions carrying a `principalIds` body, rather than with
  // per-principal POST/DELETE.  These routes follow that contract.
  // -----------------------------------------------------------------------

  // List group members (paginated) - Foundry's ListGroupMembersResponse.
  app.get<{
    Params: { groupRid: string };
    Querystring: {
      includeExpirations?: string;
      pageSize?: string;
      pageToken?: string;
      transitive?: string;
    };
  }>("/admin/groups/:groupRid/groupMembers", {
    preHandler: requirePermission("admin:manage"),
  }, async (request) => {
    const memberRids = await groupStore.getMembers(request.params.groupRid);
    // OpenFoundry groups only ever contain users, so every member is a USER
    // principal and nested groups (`transitive`) add nothing to resolve.
    const members = memberRids.map((principalId) => ({
      principalType: "USER" as const,
      principalId,
    }));
    return paginateArray(members, request.query);
  });

  // Add group members.
  app.post<{
    Params: { groupRid: string };
    Body: { principalIds: string[] };
  }>("/admin/groups/:groupRid/groupMembers/add", {
    preHandler: requirePermission("admin:manage"),
  }, async (request, reply) => {
    for (const principalId of request.body.principalIds) {
      // Verify the principal exists before adding it
      userStore.getUser(principalId);
      await groupStore.addMember(request.params.groupRid, principalId);
    }
    reply.status(204);
    return;
  });

  // Remove group members.
  app.post<{
    Params: { groupRid: string };
    Body: { principalIds: string[] };
  }>("/admin/groups/:groupRid/groupMembers/remove", {
    preHandler: requirePermission("admin:manage"),
  }, async (request, reply) => {
    for (const principalId of request.body.principalIds) {
      await groupStore.removeMember(request.params.groupRid, principalId);
    }
    reply.status(204);
    return;
  });
}
