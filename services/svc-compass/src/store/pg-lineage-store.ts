import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import type {
  LineageEdge,
  LineageEdgeType,
  LineageNode,
  LineageGraph,
} from "./lineage-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface EdgeRow {
  rid: string;
  source_rid: string;
  target_rid: string;
  edge_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToEdge(row: EdgeRow): LineageEdge {
  return {
    rid: row.rid,
    sourceRid: row.source_rid,
    targetRid: row.target_rid,
    edgeType: row.edge_type as LineageEdgeType,
    metadata: row.metadata ?? undefined,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// PgLineageStore
// ---------------------------------------------------------------------------

/**
 * PostgreSQL-backed lineage store for Compass.
 * Uses recursive CTEs for graph traversal.
 */
export class PgLineageStore {
  constructor(private pool: pg.Pool) {}

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  async addEdge(
    sourceRid: string,
    targetRid: string,
    edgeType: LineageEdgeType,
    metadata?: Record<string, unknown>,
    createdBy?: string,
  ): Promise<LineageEdge> {
    const rid = generateRid("compass", "lineage-edge").toString();

    const { rows } = await this.pool.query<EdgeRow>({
      text: `INSERT INTO lineage_edges (rid, source_rid, target_rid, edge_type, metadata, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
      values: [
        rid,
        sourceRid,
        targetRid,
        edgeType,
        metadata ? JSON.stringify(metadata) : null,
        createdBy ?? null,
      ],
    });

    return rowToEdge(rows[0]);
  }

  async removeEdge(edgeRid: string): Promise<boolean> {
    const result = await this.pool.query({
      text: `DELETE FROM lineage_edges WHERE rid = $1`,
      values: [edgeRid],
    });
    return (result.rowCount ?? 0) > 0;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  async getEdge(edgeRid: string): Promise<LineageEdge | undefined> {
    const { rows } = await this.pool.query<EdgeRow>({
      text: `SELECT * FROM lineage_edges WHERE rid = $1`,
      values: [edgeRid],
    });

    if (rows.length === 0) return undefined;
    return rowToEdge(rows[0]);
  }

  /**
   * Get upstream lineage using a recursive CTE.
   * Upstream: follow edges where the resource is the target, recurse on sources.
   */
  async getUpstream(resourceRid: string, maxDepth: number = 10): Promise<LineageGraph> {
    const { rows } = await this.pool.query<{
      rid: string;
      source_rid: string;
      target_rid: string;
      edge_type: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
      created_by: string | null;
      depth: number;
      node_rid: string;
    }>({
      text: `WITH RECURSIVE lineage AS (
               -- Base case: edges where the starting resource is the target
               SELECT e.*, 1 AS depth, e.source_rid AS node_rid
               FROM lineage_edges e
               WHERE e.target_rid = $1

               UNION ALL

               -- Recursive: follow upstream (where found node is the target)
               SELECT e.*, l.depth + 1, e.source_rid AS node_rid
               FROM lineage_edges e
               INNER JOIN lineage l ON e.target_rid = l.node_rid
               WHERE l.depth < $2
             )
             SELECT DISTINCT ON (rid) * FROM lineage`,
      values: [resourceRid, maxDepth],
    });

    const nodeMap = new Map<string, LineageNode>();
    const edgeMap = new Map<string, LineageEdge>();

    // Add the start node
    nodeMap.set(resourceRid, {
      rid: resourceRid,
      name: resourceRid,
      type: "unknown",
      depth: 0,
    });

    for (const row of rows) {
      edgeMap.set(row.rid, rowToEdge(row));

      if (!nodeMap.has(row.source_rid)) {
        nodeMap.set(row.source_rid, {
          rid: row.source_rid,
          name: row.source_rid,
          type: "unknown",
          depth: row.depth,
        });
      }
      if (!nodeMap.has(row.target_rid)) {
        nodeMap.set(row.target_rid, {
          rid: row.target_rid,
          name: row.target_rid,
          type: "unknown",
          depth: Math.max(0, row.depth - 1),
        });
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
    };
  }

  /**
   * Get downstream lineage using a recursive CTE.
   * Downstream: follow edges where the resource is the source, recurse on targets.
   */
  async getDownstream(resourceRid: string, maxDepth: number = 10): Promise<LineageGraph> {
    const { rows } = await this.pool.query<{
      rid: string;
      source_rid: string;
      target_rid: string;
      edge_type: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
      created_by: string | null;
      depth: number;
      node_rid: string;
    }>({
      text: `WITH RECURSIVE lineage AS (
               -- Base case: edges where the starting resource is the source
               SELECT e.*, 1 AS depth, e.target_rid AS node_rid
               FROM lineage_edges e
               WHERE e.source_rid = $1

               UNION ALL

               -- Recursive: follow downstream (where found node is the source)
               SELECT e.*, l.depth + 1, e.target_rid AS node_rid
               FROM lineage_edges e
               INNER JOIN lineage l ON e.source_rid = l.node_rid
               WHERE l.depth < $2
             )
             SELECT DISTINCT ON (rid) * FROM lineage`,
      values: [resourceRid, maxDepth],
    });

    const nodeMap = new Map<string, LineageNode>();
    const edgeMap = new Map<string, LineageEdge>();

    // Add the start node
    nodeMap.set(resourceRid, {
      rid: resourceRid,
      name: resourceRid,
      type: "unknown",
      depth: 0,
    });

    for (const row of rows) {
      edgeMap.set(row.rid, rowToEdge(row));

      if (!nodeMap.has(row.target_rid)) {
        nodeMap.set(row.target_rid, {
          rid: row.target_rid,
          name: row.target_rid,
          type: "unknown",
          depth: row.depth,
        });
      }
      if (!nodeMap.has(row.source_rid)) {
        nodeMap.set(row.source_rid, {
          rid: row.source_rid,
          name: row.source_rid,
          type: "unknown",
          depth: Math.max(0, row.depth - 1),
        });
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
    };
  }

  /**
   * Get full lineage -- both upstream and downstream combined.
   */
  async getFullLineage(resourceRid: string, maxDepth: number = 10): Promise<LineageGraph> {
    const [upstream, downstream] = await Promise.all([
      this.getUpstream(resourceRid, maxDepth),
      this.getDownstream(resourceRid, maxDepth),
    ]);

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
  async getDirectEdges(resourceRid: string): Promise<LineageEdge[]> {
    const { rows } = await this.pool.query<EdgeRow>({
      text: `SELECT * FROM lineage_edges
             WHERE source_rid = $1 OR target_rid = $1
             ORDER BY created_at ASC`,
      values: [resourceRid],
    });

    return rows.map(rowToEdge);
  }

  /**
   * List all edges of a given type.
   */
  async listEdgesByType(edgeType: LineageEdgeType): Promise<LineageEdge[]> {
    const { rows } = await this.pool.query<EdgeRow>({
      text: `SELECT * FROM lineage_edges WHERE edge_type = $1 ORDER BY created_at ASC`,
      values: [edgeType],
    });

    return rows.map(rowToEdge);
  }
}
