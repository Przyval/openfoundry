import type { FastifyInstance } from "fastify";
import type {
  LineageStore,
  LineageEdgeType,
  LineageEdge,
} from "../../store/lineage-store.js";

/** Serialize a LineageEdge to wire format. */
function serializeEdge(e: LineageEdge) {
  return {
    rid: e.rid,
    sourceRid: e.sourceRid,
    targetRid: e.targetRid,
    edgeType: e.edgeType,
    metadata: e.metadata,
    createdAt: e.createdAt.toISOString(),
    createdBy: e.createdBy,
  };
}

export async function lineageRoutes(
  app: FastifyInstance,
  opts: { lineageStore: LineageStore },
): Promise<void> {
  const { lineageStore } = opts;

  // Create edge
  app.post<{
    Body: {
      sourceRid: string;
      targetRid: string;
      edgeType: LineageEdgeType;
      metadata?: Record<string, unknown>;
      createdBy?: string;
    };
  }>("/compass/lineage/edges", async (request, reply) => {
    const { sourceRid, targetRid, edgeType, metadata, createdBy } =
      request.body;
    const edge = lineageStore.addEdge(
      sourceRid,
      targetRid,
      edgeType,
      metadata,
      createdBy,
    );
    reply.status(201);
    return serializeEdge(edge);
  });

  // Delete edge
  app.delete<{
    Params: { edgeRid: string };
  }>("/compass/lineage/edges/:edgeRid", async (request, reply) => {
    const removed = lineageStore.removeEdge(request.params.edgeRid);
    if (!removed) {
      reply.status(404);
      return {
        errorCode: "NOT_FOUND",
        errorName: "LineageEdgeNotFound",
        errorInstanceId: crypto.randomUUID(),
        parameters: { edgeRid: request.params.edgeRid },
        statusCode: 404,
      };
    }
    reply.status(204);
    return;
  });

  // Get upstream lineage
  app.get<{
    Params: { resourceRid: string };
    Querystring: { maxDepth?: string };
  }>("/compass/lineage/:resourceRid/upstream", async (request) => {
    const maxDepth = request.query.maxDepth
      ? parseInt(request.query.maxDepth, 10)
      : 5;
    const graph = lineageStore.getUpstream(request.params.resourceRid, maxDepth);
    return {
      nodes: graph.nodes,
      edges: graph.edges.map(serializeEdge),
    };
  });

  // Get downstream lineage
  app.get<{
    Params: { resourceRid: string };
    Querystring: { maxDepth?: string };
  }>("/compass/lineage/:resourceRid/downstream", async (request) => {
    const maxDepth = request.query.maxDepth
      ? parseInt(request.query.maxDepth, 10)
      : 5;
    const graph = lineageStore.getDownstream(
      request.params.resourceRid,
      maxDepth,
    );
    return {
      nodes: graph.nodes,
      edges: graph.edges.map(serializeEdge),
    };
  });

  // Get direct edges
  // NOTE: registered before the full lineage route to avoid param conflict
  app.get<{
    Params: { resourceRid: string };
  }>("/compass/lineage/:resourceRid/edges", async (request) => {
    const edges = lineageStore.getDirectEdges(request.params.resourceRid);
    return edges.map(serializeEdge);
  });

  // Get full lineage (both directions)
  app.get<{
    Params: { resourceRid: string };
    Querystring: { maxDepth?: string };
  }>("/compass/lineage/:resourceRid", async (request) => {
    const maxDepth = request.query.maxDepth
      ? parseInt(request.query.maxDepth, 10)
      : 5;
    const graph = lineageStore.getFullLineage(
      request.params.resourceRid,
      maxDepth,
    );
    return {
      nodes: graph.nodes,
      edges: graph.edges.map(serializeEdge),
    };
  });
}
