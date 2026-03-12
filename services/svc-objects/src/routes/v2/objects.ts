import type { FastifyInstance } from "fastify";
import type { ObjectStore } from "../../store/object-store.js";
import { requirePermission } from "@openfoundry/permissions";

// ---------------------------------------------------------------------------
// Route parameter / body types
// ---------------------------------------------------------------------------

interface ObjectParams {
  ontologyRid: string;
  objectType: string;
  primaryKey: string;
}

interface ListParams {
  ontologyRid: string;
  objectType: string;
}

interface CreateBody {
  primaryKey: string;
  properties: Record<string, unknown>;
}

interface UpdateBody {
  properties: Record<string, unknown>;
}

interface ListQuery {
  pageSize?: number;
  pageToken?: string;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function objectRoutes(
  app: FastifyInstance,
  opts: { store: ObjectStore },
): Promise<void> {
  const { store } = opts;

  // List objects (paginated)
  app.get<{ Params: ListParams; Querystring: ListQuery }>(
    "/ontologies/:ontologyRid/objects/:objectType",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectType } = request.params;
      const { pageSize, pageToken } = request.query;
      return store.listObjects(objectType, {
        pageSize: pageSize ? Number(pageSize) : undefined,
        pageToken,
      });
    },
  );

  // Get single object
  app.get<{ Params: ObjectParams }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
    {
      preHandler: requirePermission("objects:read"),
    },
    async (request) => {
      const { objectType, primaryKey } = request.params;
      return store.getObject(objectType, primaryKey);
    },
  );

  // Create object
  app.post<{ Params: ListParams; Body: CreateBody }>(
    "/ontologies/:ontologyRid/objects/:objectType",
    {
      preHandler: requirePermission("objects:write"),
    },
    async (request, reply) => {
      const { objectType } = request.params;
      const { primaryKey, properties } = request.body;
      const obj = store.createObject(objectType, primaryKey, properties);
      return reply.status(201).send(obj);
    },
  );

  // Update object
  app.put<{ Params: ObjectParams; Body: UpdateBody }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
    {
      preHandler: requirePermission("objects:write"),
    },
    async (request) => {
      const { objectType, primaryKey } = request.params;
      const { properties } = request.body;
      return store.updateObject(objectType, primaryKey, properties);
    },
  );

  // Delete object
  app.delete<{ Params: ObjectParams }>(
    "/ontologies/:ontologyRid/objects/:objectType/:primaryKey",
    {
      preHandler: requirePermission("objects:delete"),
    },
    async (request, reply) => {
      const { objectType, primaryKey } = request.params;
      store.deleteObject(objectType, primaryKey);
      return reply.status(204).send();
    },
  );
}
