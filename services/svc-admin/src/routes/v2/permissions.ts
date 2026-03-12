import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  PgPermissionStore,
  requirePermission,
} from "@openfoundry/permissions";
import { generateRid } from "@openfoundry/rid";
import { notFound, invalidArgument } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function permissionRoutes(
  app: FastifyInstance,
  opts: { permissionStore: PgPermissionStore },
): Promise<void> {
  const { permissionStore } = opts;

  // =========================================================================
  // ROLES
  // =========================================================================

  // List all roles
  app.get(
    "/admin/roles",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async () => {
      const roles = await permissionStore.listAllRoles();
      return { data: roles };
    },
  );

  // Create role
  app.post<{
    Body: {
      name: string;
      permissions: string[];
      description?: string;
    };
  }>(
    "/admin/roles",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request, reply) => {
      const { name, permissions, description } = request.body;

      if (!name || typeof name !== "string") {
        throw invalidArgument("name", "name is required");
      }
      if (!Array.isArray(permissions)) {
        throw invalidArgument("permissions", "permissions must be an array");
      }

      const rid = generateRid("admin", "role").toString();
      const role = await permissionStore.createRole({
        rid,
        name,
        permissions,
        description,
      });

      reply.status(201);
      return role;
    },
  );

  // Get role by RID
  app.get<{
    Params: { rid: string };
  }>(
    "/admin/roles/:rid",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request) => {
      const role = await permissionStore.getRole(request.params.rid);
      if (!role) {
        throw notFound("Role", request.params.rid);
      }
      return role;
    },
  );

  // Delete role
  app.delete<{
    Params: { rid: string };
  }>(
    "/admin/roles/:rid",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request) => {
      const deleted = await permissionStore.deleteRole(request.params.rid);
      if (!deleted) {
        throw notFound("Role", request.params.rid);
      }
      return { deleted: true };
    },
  );

  // =========================================================================
  // ROLE ASSIGNMENTS
  // =========================================================================

  // Assign role to user
  app.post<{
    Params: { rid: string };
    Body: { subjectRid: string };
  }>(
    "/admin/roles/:rid/assignments",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request, reply) => {
      const { rid: roleRid } = request.params;
      const { subjectRid } = request.body;

      if (!subjectRid || typeof subjectRid !== "string") {
        throw invalidArgument("subjectRid", "subjectRid is required");
      }

      // Verify role exists
      const role = await permissionStore.getRole(roleRid);
      if (!role) {
        throw notFound("Role", roleRid);
      }

      await permissionStore.assignRole(subjectRid, roleRid);
      reply.status(201);
      return { subjectRid, roleRid };
    },
  );

  // Remove role assignment
  app.delete<{
    Params: { rid: string; subjectRid: string };
  }>(
    "/admin/roles/:rid/assignments/:subjectRid",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request) => {
      const { rid: roleRid, subjectRid } = request.params;

      // Verify role exists
      const role = await permissionStore.getRole(roleRid);
      if (!role) {
        throw notFound("Role", roleRid);
      }

      await permissionStore.removeRole(subjectRid, roleRid);
      return { deleted: true };
    },
  );

  // =========================================================================
  // USER PERMISSIONS
  // =========================================================================

  // List user's effective permissions (grants + roles)
  app.get<{
    Params: { rid: string };
  }>(
    "/admin/users/:rid/permissions",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request) => {
      const subjectRid = request.params.rid;
      const [grants, roles] = await Promise.all([
        permissionStore.listGrants(subjectRid),
        permissionStore.listRoles(subjectRid),
      ]);
      return {
        subjectRid,
        grants,
        roles,
      };
    },
  );

  // =========================================================================
  // DIRECT PERMISSION GRANTS
  // =========================================================================

  // Grant permission on resource
  app.post<{
    Body: {
      subjectRid: string;
      resourceRid: string;
      permission: string;
    };
  }>(
    "/admin/permissions/grant",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request: FastifyRequest<{
      Body: {
        subjectRid: string;
        resourceRid: string;
        permission: string;
      };
    }>, reply) => {
      const { subjectRid, resourceRid, permission } = request.body;

      if (!subjectRid || typeof subjectRid !== "string") {
        throw invalidArgument("subjectRid", "subjectRid is required");
      }
      if (!resourceRid || typeof resourceRid !== "string") {
        throw invalidArgument("resourceRid", "resourceRid is required");
      }
      if (!permission || typeof permission !== "string") {
        throw invalidArgument("permission", "permission is required");
      }

      // grantedBy is the authenticated caller (or "system" in dev mode)
      const grantedBy = request.claims?.sub ?? "system";
      await permissionStore.grant(subjectRid, resourceRid, permission, grantedBy);

      reply.status(201);
      return { subjectRid, resourceRid, permission, grantedBy };
    },
  );

  // Revoke permission on resource
  app.delete<{
    Body: {
      subjectRid: string;
      resourceRid: string;
      permission: string;
    };
  }>(
    "/admin/permissions/revoke",
    {
      preHandler: requirePermission(permissionStore, "manage-roles"),
    },
    async (request: FastifyRequest<{
      Body: {
        subjectRid: string;
        resourceRid: string;
        permission: string;
      };
    }>) => {
      const { subjectRid, resourceRid, permission } = request.body;

      if (!subjectRid || typeof subjectRid !== "string") {
        throw invalidArgument("subjectRid", "subjectRid is required");
      }
      if (!resourceRid || typeof resourceRid !== "string") {
        throw invalidArgument("resourceRid", "resourceRid is required");
      }
      if (!permission || typeof permission !== "string") {
        throw invalidArgument("permission", "permission is required");
      }

      await permissionStore.revoke(subjectRid, resourceRid, permission);
      return { deleted: true };
    },
  );
}
