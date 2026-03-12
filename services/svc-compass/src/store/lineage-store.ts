import { generateRid } from "@openfoundry/rid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LineageEdgeType =
  | "DERIVED_FROM"
  | "PRODUCES"
  | "CONSUMES"
  | "TRANSFORMS"
  | "COPIES"
  | "JOINS";

export interface LineageEdge {
  rid: string;
  sourceRid: string;
  targetRid: string;
  edgeType: LineageEdgeType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  createdBy?: string;
}

export interface LineageNode {
  rid: string;
  name: string;
  type: string;
  depth: number;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

// ---------------------------------------------------------------------------
// LineageStore — in-memory storage for lineage edges
// ---------------------------------------------------------------------------

export class LineageStore {
  private readonly edges = new Map<string, LineageEdge>();

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  addEdge(
    sourceRid: string,
    targetRid: string,
    edgeType: LineageEdgeType,
    metadata?: Record<string, unknown>,
    createdBy?: string,
  ): LineageEdge {
    const rid = generateRid("compass", "lineage-edge").toString();
    const edge: LineageEdge = {
      rid,
      sourceRid,
      targetRid,
      edgeType,
      metadata,
      createdAt: new Date(),
      createdBy,
    };
    this.edges.set(rid, edge);
    return edge;
  }

  removeEdge(edgeRid: string): boolean {
    return this.edges.delete(edgeRid);
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getEdge(edgeRid: string): LineageEdge | undefined {
    return this.edges.get(edgeRid);
  }

  /**
   * Get upstream lineage — BFS traversal following edges backwards.
   * An edge points source -> target, so "upstream of X" means finding edges
   * where X is the target, then recursing on the sources.
   */
  getUpstream(resourceRid: string, maxDepth: number = 10): LineageGraph {
    return this.bfsTraverse(resourceRid, "upstream", maxDepth);
  }

  /**
   * Get downstream lineage — BFS traversal following edges forward.
   * An edge points source -> target, so "downstream of X" means finding edges
   * where X is the source, then recursing on the targets.
   */
  getDownstream(resourceRid: string, maxDepth: number = 10): LineageGraph {
    return this.bfsTraverse(resourceRid, "downstream", maxDepth);
  }

  /**
   * Get full lineage — both upstream and downstream combined.
   */
  getFullLineage(resourceRid: string, maxDepth: number = 10): LineageGraph {
    const upstream = this.getUpstream(resourceRid, maxDepth);
    const downstream = this.getDownstream(resourceRid, maxDepth);

    // Merge, deduplicating by rid
    const nodeMap = new Map<string, LineageNode>();
    const edgeMap = new Map<string, LineageEdge>();

    for (const n of upstream.nodes) nodeMap.set(n.rid, n);
    for (const n of downstream.nodes) nodeMap.set(n.rid, n);
    for (const e of upstream.edges) edgeMap.set(e.rid, e);
    for (const e of downstream.edges) edgeMap.set(e.rid, e);

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
    };
  }

  /**
   * Get all edges directly connected to a resource (as source or target).
   */
  getDirectEdges(resourceRid: string): LineageEdge[] {
    const result: LineageEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceRid === resourceRid || edge.targetRid === resourceRid) {
        result.push(edge);
      }
    }
    return result;
  }

  /**
   * List all edges of a given type.
   */
  listEdgesByType(edgeType: LineageEdgeType): LineageEdge[] {
    const result: LineageEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.edgeType === edgeType) {
        result.push(edge);
      }
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Internal BFS
  // -----------------------------------------------------------------------

  private bfsTraverse(
    startRid: string,
    direction: "upstream" | "downstream",
    maxDepth: number,
  ): LineageGraph {
    const nodes = new Map<string, LineageNode>();
    const collectedEdges = new Map<string, LineageEdge>();
    const visited = new Set<string>();
    const queue: Array<{ rid: string; depth: number }> = [
      { rid: startRid, depth: 0 },
    ];

    // Add the start node at depth 0
    nodes.set(startRid, {
      rid: startRid,
      name: startRid,
      type: "unknown",
      depth: 0,
    });

    while (queue.length > 0) {
      const { rid: currentRid, depth } = queue.shift()!;

      if (visited.has(currentRid)) continue;
      visited.add(currentRid);

      if (depth >= maxDepth) continue;

      for (const edge of this.edges.values()) {
        let nextRid: string | undefined;

        if (direction === "upstream" && edge.targetRid === currentRid) {
          nextRid = edge.sourceRid;
        } else if (direction === "downstream" && edge.sourceRid === currentRid) {
          nextRid = edge.targetRid;
        }

        if (nextRid !== undefined) {
          collectedEdges.set(edge.rid, edge);

          if (!nodes.has(nextRid)) {
            nodes.set(nextRid, {
              rid: nextRid,
              name: nextRid,
              type: "unknown",
              depth: depth + 1,
            });
          }

          if (!visited.has(nextRid)) {
            queue.push({ rid: nextRid, depth: depth + 1 });
          }
        }
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges: Array.from(collectedEdges.values()),
    };
  }
}
