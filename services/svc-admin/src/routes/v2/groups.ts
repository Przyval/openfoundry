import type { FastifyInstance } from "fastify";
import type { GroupStore, StoredGroup } from "../../store/group-store.js";
import type { UserStore } from "../../store/user-store.js";
import { requirePermission } from "@openfoundry/permissions";
import { paginateArray } from "./pagination-helpers.js";

/** Serialize a StoredGroup to the wire format. */
function serializeGroup(g: StoredGroup) {
  return {
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
    const memberRids = groupStore.getMembers(request.params.groupRid);
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
}
