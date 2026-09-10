import type { FastifyInstance } from "fastify";
import { invalidArgument } from "@openfoundry/errors";
import type {
  LineageStore,
  LineageEdgeType,
  LineageEdge,
} from "../../store/lineage-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineageRouteOptions {
  lineageStore: LineageStore;
}

interface CreateEdgeBody {
  sourceRid: string;
  targetRid: string;
  edgeType: string;
  metadata?: Record<string, unknown>;
}

interface LineageNodeWire {
  rid: string;
  label: string;
  type: "source" | "transform" | "dataset" | "object_type";
}

interface LineageEdgeWire {
  sourceRid: string;
  targetRid: string;
  edgeType: string;
}

const VALID_EDGE_TYPES: ReadonlySet<string> = new Set([
  "DERIVED_FROM",
  "PRODUCES",
  "CONSUMES",
  "TRANSFORMS",
  "COPIES",
  "JOINS",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Infer a node type label from the RID or edge context. */
function inferNodeType(rid: string): LineageNodeWire["type"] {
  if (rid.includes("dataset")) return "dataset";
  if (rid.includes("transform") || rid.includes("pipeline")) return "transform";
  if (rid.includes("object") || rid.includes("ontology")) return "object_type";
  return "source";
}

function toNodeWire(rid: string): LineageNodeWire {
  return {
    rid,
    label: rid,
    type: inferNodeType(rid),
  };
}

function toEdgeWire(e: LineageEdge): LineageEdgeWire {
  return {
    sourceRid: e.sourceRid,
    targetRid: e.targetRid,
    edgeType: e.edgeType,
  };
}

/** Collect all edges from the store across every edge type. */
function collectAllEdges(
  lineageStore: LineageStore,
): { edgeMap: Map<string, LineageEdge>; nodeRids: Set<string> } {
  const allEdgeTypes: LineageEdgeType[] = [
    "DERIVED_FROM",
    "PRODUCES",
    "CONSUMES",
    "TRANSFORMS",
    "COPIES",
    "JOINS",
  ];

  const edgeMap = new Map<string, LineageEdge>();
  const nodeRids = new Set<string>();

  for (const edgeType of allEdgeTypes) {
    const edges = lineageStore.listEdgesByType(edgeType);
    for (const edge of edges) {
      edgeMap.set(edge.rid, edge);
      nodeRids.add(edge.sourceRid);
      nodeRids.add(edge.targetRid);
    }
  }

  return { edgeMap, nodeRids };
}

// ---------------------------------------------------------------------------
// Full lineage graph routes  (Feature 6)
//
// These complement the existing per-resource traversal routes in
// lineage-routes.ts which provide BFS upstream/downstream queries and the
// original POST /compass/lineage/edges endpoint.
// ---------------------------------------------------------------------------

export async function lineageGraphRoutes(
  app: FastifyInstance,
  opts: LineageRouteOptions,
): Promise<void> {
  const { lineageStore } = opts;

  // -----------------------------------------------------------------------
  // GET /compass/lineage — return the full lineage graph
  // -----------------------------------------------------------------------
  app.get("/compass/lineage", async (_request, reply) => {
    try {
      const { edgeMap, nodeRids } = collectAllEdges(lineageStore);

      const nodes: LineageNodeWire[] = Array.from(nodeRids).map(toNodeWire);
      const edges: LineageEdgeWire[] = Array.from(edgeMap.values()).map(toEdgeWire);

      return reply.status(200).send({ nodes, edges });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(500).send({
        errorCode: "INTERNAL",
        errorName: "InternalError",
        errorInstanceId: crypto.randomUUID(),
        parameters: { detail: message },
        statusCode: 500,
      });
    }
  });

  // -----------------------------------------------------------------------
  // GET /compass/lineage/by-type/:objectType — edges for a specific object type
  //
  // Uses /by-type/ prefix to avoid collision with the existing
  // GET /compass/lineage/:resourceRid route in lineage-routes.ts.
  //
  // Matches objectType against source/target RIDs and edge metadata.
  // -----------------------------------------------------------------------
  app.get<{
    Params: { objectType: string };
  }>("/compass/lineage/by-type/:objectType", async (request, reply) => {
    const { objectType } = request.params;

    try {
      const { edgeMap } = collectAllEdges(lineageStore);

      const matchingEdges: LineageEdgeWire[] = [];
      const matchedNodeRids = new Set<string>();

      for (const edge of edgeMap.values()) {
        const sourceMatch = edge.sourceRid.includes(objectType);
        const targetMatch = edge.targetRid.includes(objectType);
        const metaMatch =
          edge.metadata?.objectType === objectType ||
          edge.metadata?.sourceType === objectType ||
          edge.metadata?.targetType === objectType;

        if (sourceMatch || targetMatch || metaMatch) {
          matchingEdges.push(toEdgeWire(edge));
          matchedNodeRids.add(edge.sourceRid);
          matchedNodeRids.add(edge.targetRid);
        }
      }

      const nodes: LineageNodeWire[] = Array.from(matchedNodeRids).map(toNodeWire);

      return reply.status(200).send({ nodes, edges: matchingEdges });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(500).send({
        errorCode: "INTERNAL",
        errorName: "InternalError",
        errorInstanceId: crypto.randomUUID(),
        parameters: { detail: message },
        statusCode: 500,
      });
    }
  });

  // -----------------------------------------------------------------------
  // POST /compass/lineage/edges — create a lineage edge
  //
  // This version adds input validation with proper error types on top of
  // the original in lineage-routes.ts.  To avoid a duplicate route, the
  // original registration in lineage-routes.ts should be the canonical one.
  // We register at a /v2-prefixed path so both can coexist.
  // -----------------------------------------------------------------------
  app.post<{
    Body: CreateEdgeBody;
  }>("/compass/lineage/graph/edges", async (request, reply) => {
    const { sourceRid, targetRid, edgeType, metadata } =
      request.body ?? ({} as CreateEdgeBody);

    if (!sourceRid) {
      throw invalidArgument("sourceRid", "is required");
    }
    if (!targetRid) {
      throw invalidArgument("targetRid", "is required");
    }
    if (!edgeType) {
      throw invalidArgument("edgeType", "is required");
    }
    if (!VALID_EDGE_TYPES.has(edgeType)) {
      throw invalidArgument(
        "edgeType",
        `must be one of: ${Array.from(VALID_EDGE_TYPES).join(", ")}`,
      );
    }

    try {
      const edge = lineageStore.addEdge(
        sourceRid,
        targetRid,
        edgeType as LineageEdgeType,
        metadata,
      );

      return reply.status(201).send({
        rid: edge.rid,
        sourceRid: edge.sourceRid,
        targetRid: edge.targetRid,
        edgeType: edge.edgeType,
        metadata: edge.metadata,
        createdAt: edge.createdAt.toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.status(500).send({
        errorCode: "INTERNAL",
        errorName: "InternalError",
        errorInstanceId: crypto.randomUUID(),
        parameters: { detail: message },
        statusCode: 500,
      });
    }
  });
}
