import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { LineageStore } from "../src/store/lineage-store.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
} as const;

let app: FastifyInstance;
let lineageStore: LineageStore;

beforeEach(async () => {
  lineageStore = new LineageStore();
  app = await createServer({ config: TEST_CONFIG, lineageStore });
});

// -------------------------------------------------------------------------
// LineageStore unit tests
// -------------------------------------------------------------------------

describe("LineageStore", () => {
  it("addEdge creates and returns an edge", () => {
    const edge = lineageStore.addEdge("src-1", "tgt-1", "DERIVED_FROM", { note: "test" }, "user-1");
    expect(edge.rid).toMatch(/^ri\./);
    expect(edge.sourceRid).toBe("src-1");
    expect(edge.targetRid).toBe("tgt-1");
    expect(edge.edgeType).toBe("DERIVED_FROM");
    expect(edge.metadata).toEqual({ note: "test" });
    expect(edge.createdBy).toBe("user-1");
    expect(edge.createdAt).toBeInstanceOf(Date);
  });

  it("getEdge retrieves an existing edge", () => {
    const edge = lineageStore.addEdge("src-1", "tgt-1", "COPIES");
    const found = lineageStore.getEdge(edge.rid);
    expect(found).toBeDefined();
    expect(found!.rid).toBe(edge.rid);
  });

  it("getEdge returns undefined for unknown rid", () => {
    expect(lineageStore.getEdge("nonexistent")).toBeUndefined();
  });

  it("removeEdge deletes an edge and returns true", () => {
    const edge = lineageStore.addEdge("a", "b", "PRODUCES");
    expect(lineageStore.removeEdge(edge.rid)).toBe(true);
    expect(lineageStore.getEdge(edge.rid)).toBeUndefined();
  });

  it("removeEdge returns false for unknown rid", () => {
    expect(lineageStore.removeEdge("nonexistent")).toBe(false);
  });

  it("getDirectEdges returns edges where resource is source or target", () => {
    lineageStore.addEdge("A", "B", "PRODUCES");
    lineageStore.addEdge("C", "A", "CONSUMES");
    lineageStore.addEdge("D", "E", "COPIES");

    const edges = lineageStore.getDirectEdges("A");
    expect(edges).toHaveLength(2);
  });

  it("listEdgesByType filters by edge type", () => {
    lineageStore.addEdge("A", "B", "PRODUCES");
    lineageStore.addEdge("C", "D", "PRODUCES");
    lineageStore.addEdge("E", "F", "COPIES");

    const produces = lineageStore.listEdgesByType("PRODUCES");
    expect(produces).toHaveLength(2);
    const copies = lineageStore.listEdgesByType("COPIES");
    expect(copies).toHaveLength(1);
  });

  // Multi-level graph:  A -> B -> C -> D
  //                          B -> E
  describe("multi-level traversal", () => {
    beforeEach(() => {
      lineageStore.addEdge("A", "B", "DERIVED_FROM");
      lineageStore.addEdge("B", "C", "TRANSFORMS");
      lineageStore.addEdge("C", "D", "PRODUCES");
      lineageStore.addEdge("B", "E", "COPIES");
    });

    it("getUpstream returns ancestors of a node", () => {
      const graph = lineageStore.getUpstream("C", 10);
      const nodeRids = graph.nodes.map((n) => n.rid);
      expect(nodeRids).toContain("C");
      expect(nodeRids).toContain("B");
      expect(nodeRids).toContain("A");
      // D is downstream, not upstream
      expect(nodeRids).not.toContain("D");
      expect(graph.edges).toHaveLength(2); // A->B and B->C
    });

    it("getDownstream returns descendants of a node", () => {
      const graph = lineageStore.getDownstream("B", 10);
      const nodeRids = graph.nodes.map((n) => n.rid);
      expect(nodeRids).toContain("B");
      expect(nodeRids).toContain("C");
      expect(nodeRids).toContain("D");
      expect(nodeRids).toContain("E");
      // A is upstream, not downstream
      expect(nodeRids).not.toContain("A");
    });

    it("getFullLineage returns both directions", () => {
      const graph = lineageStore.getFullLineage("B", 10);
      const nodeRids = graph.nodes.map((n) => n.rid);
      expect(nodeRids).toContain("A");
      expect(nodeRids).toContain("B");
      expect(nodeRids).toContain("C");
      expect(nodeRids).toContain("D");
      expect(nodeRids).toContain("E");
      expect(graph.edges).toHaveLength(4);
    });

    it("getUpstream respects maxDepth", () => {
      const graph = lineageStore.getUpstream("D", 1);
      const nodeRids = graph.nodes.map((n) => n.rid);
      expect(nodeRids).toContain("D");
      expect(nodeRids).toContain("C");
      // A and B are beyond depth 1
      expect(nodeRids).not.toContain("A");
    });

    it("getDownstream respects maxDepth", () => {
      const graph = lineageStore.getDownstream("A", 1);
      const nodeRids = graph.nodes.map((n) => n.rid);
      expect(nodeRids).toContain("A");
      expect(nodeRids).toContain("B");
      expect(nodeRids).not.toContain("C");
      expect(nodeRids).not.toContain("D");
    });
  });
});

// -------------------------------------------------------------------------
// Lineage routes via Fastify inject
// -------------------------------------------------------------------------

describe("Lineage routes", () => {
  it("POST /api/v2/compass/lineage/edges creates an edge", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: {
        sourceRid: "ri.compass.main.dataset.src",
        targetRid: "ri.compass.main.dataset.tgt",
        edgeType: "DERIVED_FROM",
        metadata: { pipeline: "etl-1" },
        createdBy: "test-user",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.rid).toMatch(/^ri\./);
    expect(body.sourceRid).toBe("ri.compass.main.dataset.src");
    expect(body.targetRid).toBe("ri.compass.main.dataset.tgt");
    expect(body.edgeType).toBe("DERIVED_FROM");
    expect(body.metadata).toEqual({ pipeline: "etl-1" });
    expect(body.createdBy).toBe("test-user");
    expect(body.createdAt).toBeDefined();
  });

  it("DELETE /api/v2/compass/lineage/edges/:edgeRid removes an edge", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "A", targetRid: "B", edgeType: "COPIES" },
    });
    const edgeRid = createRes.json().rid;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v2/compass/lineage/edges/${edgeRid}`,
    });
    expect(delRes.statusCode).toBe(204);
  });

  it("DELETE returns 404 for unknown edge", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/v2/compass/lineage/edges/ri.compass.main.lineage-edge.nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/v2/compass/lineage/:resourceRid/upstream returns upstream graph", async () => {
    // A -> B -> C
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "A", targetRid: "B", edgeType: "PRODUCES" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "B", targetRid: "C", edgeType: "TRANSFORMS" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/lineage/C/upstream?maxDepth=5",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const nodeRids = body.nodes.map((n: { rid: string }) => n.rid);
    expect(nodeRids).toContain("C");
    expect(nodeRids).toContain("B");
    expect(nodeRids).toContain("A");
  });

  it("GET /api/v2/compass/lineage/:resourceRid/downstream returns downstream graph", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "A", targetRid: "B", edgeType: "PRODUCES" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/lineage/A/downstream?maxDepth=5",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const nodeRids = body.nodes.map((n: { rid: string }) => n.rid);
    expect(nodeRids).toContain("A");
    expect(nodeRids).toContain("B");
  });

  it("GET /api/v2/compass/lineage/:resourceRid returns full lineage", async () => {
    // A -> B -> C
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "A", targetRid: "B", edgeType: "DERIVED_FROM" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "B", targetRid: "C", edgeType: "JOINS" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/lineage/B?maxDepth=5",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const nodeRids = body.nodes.map((n: { rid: string }) => n.rid);
    expect(nodeRids).toContain("A");
    expect(nodeRids).toContain("B");
    expect(nodeRids).toContain("C");
  });

  it("GET /api/v2/compass/lineage/:resourceRid/edges returns direct edges", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "X", targetRid: "Y", edgeType: "CONSUMES" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "Z", targetRid: "X", edgeType: "PRODUCES" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/compass/lineage/edges",
      payload: { sourceRid: "M", targetRid: "N", edgeType: "COPIES" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v2/compass/lineage/X/edges",
    });
    expect(res.statusCode).toBe(200);
    const edges = res.json();
    expect(edges).toHaveLength(2);
  });
});
