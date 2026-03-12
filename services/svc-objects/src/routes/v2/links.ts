import type { FastifyInstance } from "fastify";
import type { LinkStore } from "../../store/link-store.js";
import { requirePermission } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Route parameter / body types
// ---------------------------------------------------------------------------

interface LinkParams {
  ontologyRid: string;
  objectType: string;
  primaryKey: string;
  linkType: string;
}

interface DeleteLinkParams extends LinkParams {
  targetPrimaryKey: string;
}

interface CreateLinkBody {
  targetObjectType: string;
  targetPrimaryKey: string;
}

interface LinkQuery {
  pageSize?: number;
  pageToken?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function linkRoutes(
  app: FastifyInstance,
  opts: { linkStore: LinkStore },
): Promise<void> {
  const { linkStore } = opts;

  // Get linked objects (paginated)
  app.get<{ Params: LinkParams; Querystring: LinkQuery }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey/links/:linkType",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectType, primaryKey, linkType } = request.params;
      const { pageSize, pageToken } = request.query;
      return linkStore.getLinks(
        objectType,
        primaryKey,
        linkType,
        pageSize ? Number(pageSize) : undefined,
        pageToken,
      );
    },
  );

  // Create link
  app.post<{ Params: LinkParams; Body: CreateLinkBody }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey/links/:linkType",
    {
      preHandler: requirePermission("objects:write"),
    },
    async (request, reply) => {
      const { objectType, primaryKey, linkType } = request.params;
      const { targetObjectType, targetPrimaryKey } = request.body;
      const link = linkStore.createLink(
        objectType,
        primaryKey,
        linkType,
        targetObjectType,
        targetPrimaryKey,
      );
      return reply.status(201).send(link);
    },
  );

  // Delete link
  app.delete<{ Params: DeleteLinkParams }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey/links/:linkType/:targetPrimaryKey",
    {
      preHandler: requirePermission("objects:delete"),
    },
    async (request, reply) => {
      const { objectType, primaryKey, linkType, targetPrimaryKey } = request.params;
      linkStore.deleteLink(objectType, primaryKey, linkType, targetPrimaryKey);
      return reply.status(204).send();
    },
  );
}
