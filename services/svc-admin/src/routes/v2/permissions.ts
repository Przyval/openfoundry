import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  ROLES,
  ROOT_RESOURCE,
  isRoleId,
  requirePermission,
  type PrincipalType,
  type RoleGrant,
} from "@openfoundry/permissions";
import { invalidArgument, notFound } from "@openfoundry/errors";

/**
 * Roles and mandatory controls, shaped after Foundry's filesystem API.
 *
 * Roles are platform-defined and read-only: listing them is all the API does.
 * What an operator manages is who holds a role on a resource - Foundry's
 * `POST /filesystem/resources/{resourceRid}/roles/add` - and the Organization
 * and Marking restrictions on it. Both need Owner on the resource.
 */

interface RoleBody {
  roles?: Array<{ principalId?: unknown; principalType?: unknown; roleId?: unknown }>;
}

const PRINCIPAL_TYPES: Record<string, PrincipalType> = { USER: "user", GROUP: "group" };

function parseRoles(body: RoleBody | undefined) {
  if (!body || !Array.isArray(body.roles) || body.roles.length === 0) {
    throw invalidArgument("roles", "roles must be a non-empty array");
  }
  return body.roles.map((r, i) => {
    const principalType = typeof r.principalType === "string" ? PRINCIPAL_TYPES[r.principalType] : undefined;
    if (!principalType) {
      throw invalidArgument(`roles[${i}].principalType`, "principalType must be USER or GROUP");
    }
    if (typeof r.principalId !== "string" || r.principalId === "") {
      throw invalidArgument(`roles[${i}].principalId`, "principalId is required");
    }
    if (!isRoleId(r.roleId)) {
      throw invalidArgument(`roles[${i}].roleId`, `roleId must be one of ${ROLES.map((x) => x.id).join(", ")}`);
    }
    return { principalType, principalId: r.principalId, roleId: r.roleId };
  });
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v === "")) {
    throw invalidArgument(field, `${field} must be an array of non-empty strings`);
  }
  return [...new Set(value as string[])];
}

const wire = (g: RoleGrant) => ({
  roleId: g.roleId,
  principalId: g.principalId,
  principalType: g.principalType === "user" ? "USER" : "GROUP",
  grantedBy: g.grantedBy,
  grantedAt: g.grantedAt,
});

export async function permissionRoutes(app: FastifyInstance): Promise<void> {
  // Management is Owner on the resource the path names; the platform root
  // (`ri.platform.main.root.root`) stands for the platform itself.
  const managed = (request: FastifyRequest) => {
    const rid = (request.params as { resourceRid: string }).resourceRid;
    return rid === ROOT_RESOURCE ? [ROOT_RESOURCE] : [rid, ROOT_RESOURCE];
  };
  const manage = requirePermission("resource:manage-roles", { resource: managed });
  // A Marking nobody holds would lock everyone out of a resource for good, so
  // a platform administrator may read and replace its policy without holding
  // what the policy demands. Every other route still binds them.
  const managePolicy = requirePermission("resource:manage-roles", {
    resource: managed,
    platformAdminOverridesControls: true,
  });

  // Roles are platform-defined: read-only, as in Foundry.
  app.get("/admin/roles", { preHandler: requirePermission("admin:manage") }, async () => ({
    data: ROLES,
  }));

  app.get<{ Params: { roleId: string } }>(
    "/admin/roles/:roleId",
    { preHandler: requirePermission("admin:manage") },
    async (request) => {
      const role = ROLES.find((r) => r.id === request.params.roleId);
      if (!role) throw notFound("Role", request.params.roleId);
      return role;
    },
  );

  app.get<{ Params: { resourceRid: string } }>(
    "/admin/resources/:resourceRid/roles",
    { preHandler: manage },
    async (request) => ({
      data: (await app.authorization.listGrants(request.params.resourceRid)).map(wire),
    }),
  );

  app.post<{ Params: { resourceRid: string }; Body: RoleBody }>(
    "/admin/resources/:resourceRid/roles/add",
    { preHandler: manage },
    async (request, reply) => {
      const grants = parseRoles(request.body);
      const grantedBy = request.identity?.userId ?? "system";
      const grantedAt = new Date().toISOString();
      for (const g of grants) {
        await app.authorization.addGrant({ resourceRid: request.params.resourceRid, ...g, grantedBy, grantedAt });
      }
      reply.status(204);
    },
  );

  app.post<{ Params: { resourceRid: string }; Body: RoleBody }>(
    "/admin/resources/:resourceRid/roles/remove",
    { preHandler: manage },
    async (request, reply) => {
      for (const g of parseRoles(request.body)) {
        await app.authorization.removeGrant(request.params.resourceRid, g, g.roleId);
      }
      reply.status(204);
    },
  );

  app.get<{ Params: { resourceRid: string } }>(
    "/admin/resources/:resourceRid/policy",
    { preHandler: managePolicy },
    async (request) => {
      const [policy] = await app.authorization.policiesFor([request.params.resourceRid]);
      return { organizations: policy?.organizations ?? [], markings: policy?.markings ?? [] };
    },
  );

  // Replaces the whole policy. Applying a Marking takes effect on everything
  // the resource contains at once, which is why it is Owner-only.
  app.put<{ Params: { resourceRid: string }; Body: { organizations?: unknown; markings?: unknown } }>(
    "/admin/resources/:resourceRid/policy",
    { preHandler: managePolicy },
    async (request) => {
      const organizations = stringList(request.body?.organizations, "organizations");
      const markings = stringList(request.body?.markings, "markings");
      await app.authorization.setPolicy({ resourceRid: request.params.resourceRid, organizations, markings });
      return { organizations, markings };
    },
  );
}
