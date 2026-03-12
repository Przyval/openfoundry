import type { FastifyInstance } from "fastify";
import type { CompassStore } from "../../store/compass-store.js";

export async function resourceRoutes(
  app: FastifyInstance,
  opts: { store: CompassStore },
): Promise<void> {
  const { store } = opts;

  // List root resources
  app.get("/compass/resources", async (_request) => {
    const resources = store.listRootResources();
    return { data: resources };
  });

  // Create resource
  app.post<{
    Body: {
      name: string;
      type: "FOLDER" | "PROJECT" | "SPACE";
      parentRid?: string | null;
      description?: string;
      createdBy?: string;
      markings?: string[];
    };
  }>("/compass/resources", async (request, reply) => {
    const resource = store.createResource(request.body);
    reply.status(201);
    return resource;
  });

  // Search resources
  app.get<{
    Querystring: { q?: string };
  }>("/compass/search", async (request) => {
    const query = request.query.q ?? "";
    const results = store.searchResources(query);
    return { data: results };
  });

  // Get resource by RID
  app.get<{
    Params: { rid: string };
  }>("/compass/resources/:rid", async (request) => {
    return store.getResource(request.params.rid);
  });

  // Update resource
  app.put<{
    Params: { rid: string };
    Body: {
      name?: string;
      description?: string;
      markings?: string[];
    };
  }>("/compass/resources/:rid", async (request) => {
    return store.updateResource(request.params.rid, request.body);
  });

  // Delete resource
  app.delete<{
    Params: { rid: string };
    Querystring: { recursive?: string };
  }>("/compass/resources/:rid", async (request, reply) => {
    const recursive = request.query.recursive === "true";
    store.deleteResource(request.params.rid, recursive);
    reply.status(204);
    return;
  });

  // List children
  app.get<{
    Params: { rid: string };
  }>("/compass/resources/:rid/children", async (request) => {
    // Verify the parent exists
    store.getResource(request.params.rid);
    const children = store.listChildren(request.params.rid);
    return { data: children };
  });

  // Get path (breadcrumbs)
  app.get<{
    Params: { rid: string };
  }>("/compass/resources/:rid/path", async (request) => {
    const path = store.getPath(request.params.rid);
    return { data: path };
  });

  // Move resource
  app.post<{
    Params: { rid: string };
    Body: { newParentRid: string | null };
  }>("/compass/resources/:rid/move", async (request) => {
    return store.moveResource(request.params.rid, request.body.newParentRid);
  });
}
