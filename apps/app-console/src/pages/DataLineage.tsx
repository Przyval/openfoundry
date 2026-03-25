import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Colors,
  Icon,
  InputGroup,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import { API_BASE_URL } from "../config";

/* ---------- types ---------- */

type NodeCategory = "source" | "transform" | "object" | "application";

interface LineageNode {
  id: string;
  label: string;
  category: NodeCategory;
  description: string;
  lastUpdated: string;
  recordCount: number | null;
}

interface LineageEdge {
  source: string;
  target: string;
}

/* ---------- color & layout constants ---------- */

const CATEGORY_META: Record<
  NodeCategory,
  { color: string; label: string; icon: string }
> = {
  source: { color: "#0F9960", label: "Source", icon: "document" },
  transform: { color: "#2B95D6", label: "Transform", icon: "cog" },
  object: { color: "#D9822B", label: "Object Type", icon: "cube" },
  application: { color: "#7157D9", label: "Application", icon: "application" },
};

const COLUMN_ORDER: NodeCategory[] = [
  "source",
  "transform",
  "object",
  "application",
];

const SVG_WIDTH = 960;
const SVG_HEIGHT = 620;
const NODE_W = 150;
const NODE_H = 40;
const NODE_RX = 8;
const COL_SPACING = SVG_WIDTH / 4;
const COL_PAD = 40;

/* ---------- static graph data ---------- */

const NODES: LineageNode[] = [
  // Sources
  { id: "src-seed", label: "Pest Control Seed Data", category: "source", description: "Initial bootstrap dataset containing all pest control domain objects.", lastUpdated: "2026-03-24T02:00:00Z", recordCount: null },
  { id: "src-csv", label: "CSV Import", category: "source", description: "Periodic CSV file uploads from legacy system.", lastUpdated: "2026-03-23T18:30:00Z", recordCount: null },
  { id: "src-api", label: "REST API Sync", category: "source", description: "Real-time REST API sync from external CRM.", lastUpdated: "2026-03-24T06:15:00Z", recordCount: null },
  // Transforms
  { id: "tf-enrich", label: "Customer Enrichment", category: "transform", description: "Enriches customer records with geo-coding and credit scores.", lastUpdated: "2026-03-24T04:00:00Z", recordCount: null },
  { id: "tf-jobstatus", label: "Job Status Pipeline", category: "transform", description: "Computes derived job statuses and schedules from raw service data.", lastUpdated: "2026-03-24T03:45:00Z", recordCount: null },
  { id: "tf-revenue", label: "Revenue Calculator", category: "transform", description: "Aggregates invoice line items into revenue metrics.", lastUpdated: "2026-03-24T05:00:00Z", recordCount: null },
  { id: "tf-stock", label: "Stock Monitor", category: "transform", description: "Tracks treatment product inventory levels and reorder thresholds.", lastUpdated: "2026-03-24T01:30:00Z", recordCount: null },
  // Object Types
  { id: "obj-Customer", label: "Customer", category: "object", description: "Ontology object representing a pest control customer.", lastUpdated: "2026-03-24T06:00:00Z", recordCount: null },
  { id: "obj-Technician", label: "Technician", category: "object", description: "Ontology object representing a field technician.", lastUpdated: "2026-03-24T06:00:00Z", recordCount: null },
  { id: "obj-ServiceJob", label: "ServiceJob", category: "object", description: "Ontology object representing a service job or visit.", lastUpdated: "2026-03-24T06:00:00Z", recordCount: null },
  { id: "obj-TreatmentProduct", label: "TreatmentProduct", category: "object", description: "Ontology object representing a chemical treatment product.", lastUpdated: "2026-03-24T06:00:00Z", recordCount: null },
  { id: "obj-Invoice", label: "Invoice", category: "object", description: "Ontology object representing a billing invoice.", lastUpdated: "2026-03-24T06:00:00Z", recordCount: null },
  { id: "obj-Vehicle", label: "Vehicle", category: "object", description: "Ontology object representing a fleet vehicle.", lastUpdated: "2026-03-24T06:00:00Z", recordCount: null },
  { id: "obj-Schedule", label: "Schedule", category: "object", description: "Ontology object representing a technician schedule.", lastUpdated: "2026-03-24T06:00:00Z", recordCount: null },
  // Applications
  { id: "app-dashboard", label: "Pest Control Dashboard", category: "application", description: "Primary operational dashboard for pest control managers.", lastUpdated: "2026-03-24T06:10:00Z", recordCount: null },
  { id: "app-workshop", label: "Workshop App", category: "application", description: "Interactive low-code application builder.", lastUpdated: "2026-03-24T06:10:00Z", recordCount: null },
  { id: "app-contour", label: "Contour Analysis", category: "application", description: "Analytical exploration and charting tool.", lastUpdated: "2026-03-24T06:10:00Z", recordCount: null },
  { id: "app-graph", label: "Network Graph", category: "application", description: "Entity relationship network visualization.", lastUpdated: "2026-03-24T06:10:00Z", recordCount: null },
];

const OBJECT_TYPE_IDS = NODES.filter((n) => n.category === "object").map(
  (n) => n.id,
);

const EDGES: LineageEdge[] = [
  // Seed → all 7 object types
  ...OBJECT_TYPE_IDS.map((oid) => ({ source: "src-seed", target: oid })),
  // CSV → Customer, TreatmentProduct
  { source: "src-csv", target: "obj-Customer" },
  { source: "src-csv", target: "obj-TreatmentProduct" },
  // REST API → Customer (enrichment source)
  { source: "src-api", target: "tf-enrich" },
  // Transforms → Objects
  { source: "tf-enrich", target: "obj-Customer" },
  { source: "tf-revenue", target: "obj-Invoice" },
  { source: "tf-stock", target: "obj-TreatmentProduct" },
  { source: "tf-jobstatus", target: "obj-ServiceJob" },
  { source: "tf-jobstatus", target: "obj-Schedule" },
  // All object types → all applications
  ...OBJECT_TYPE_IDS.flatMap((oid) => [
    { source: oid, target: "app-dashboard" },
    { source: oid, target: "app-workshop" },
    { source: oid, target: "app-contour" },
    { source: oid, target: "app-graph" },
  ]),
];

/* ---------- helpers ---------- */

function nodePos(
  node: LineageNode,
  nodesInCol: LineageNode[],
): { x: number; y: number } {
  const colIdx = COLUMN_ORDER.indexOf(node.category);
  const x = COL_PAD + colIdx * COL_SPACING + (COL_SPACING - NODE_W) / 2;
  const idx = nodesInCol.indexOf(node);
  const count = nodesInCol.length;
  const totalH = count * NODE_H + (count - 1) * 14;
  const startY = (SVG_HEIGHT - totalH) / 2;
  const y = startY + idx * (NODE_H + 14);
  return { x, y };
}

/** Compute cubic bezier path between two node rects (left-to-right). */
function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const sx = x1 + NODE_W;
  const sy = y1 + NODE_H / 2;
  const ex = x2;
  const ey = y2 + NODE_H / 2;
  const cp = (ex - sx) * 0.5;
  return `M${sx},${sy} C${sx + cp},${sy} ${ex - cp},${ey} ${ex},${ey}`;
}

/** Walk upstream and downstream edges from a node to collect full reachable set. */
function traceLineage(
  nodeId: string,
  edges: LineageEdge[],
): { nodes: Set<string>; edges: Set<number> } {
  const reachNodes = new Set<string>([nodeId]);
  const reachEdges = new Set<number>();

  // Upstream (walk backward through source→target)
  const upQueue = [nodeId];
  while (upQueue.length) {
    const cur = upQueue.pop()!;
    edges.forEach((e, i) => {
      if (e.target === cur && !reachNodes.has(e.source)) {
        reachNodes.add(e.source);
        reachEdges.add(i);
        upQueue.push(e.source);
      } else if (e.target === cur && reachNodes.has(e.source)) {
        reachEdges.add(i);
      }
    });
  }

  // Downstream (walk forward through source→target)
  const downQueue = [nodeId];
  while (downQueue.length) {
    const cur = downQueue.pop()!;
    edges.forEach((e, i) => {
      if (e.source === cur && !reachNodes.has(e.target)) {
        reachNodes.add(e.target);
        reachEdges.add(i);
        downQueue.push(e.target);
      } else if (e.source === cur && reachNodes.has(e.target)) {
        reachEdges.add(i);
      }
    });
  }

  return { nodes: reachNodes, edges: reachEdges };
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/* ---------- main component ---------- */

export default function DataLineage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [objectCounts, setObjectCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [tooltipInfo, setTooltipInfo] = useState<{
    node: LineageNode;
    x: number;
    y: number;
  } | null>(null);

  const token = localStorage.getItem("token") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Fetch ontology object counts on mount
  useEffect(() => {
    const fetchCounts = async () => {
      setLoadingCounts(true);
      try {
        const ontRes = await fetch(`${API_BASE_URL}/api/v2/ontologies`, {
          headers,
        });
        const ontData = await ontRes.json();
        const ontList = ontData.data ?? [];
        if (ontList.length === 0) {
          setLoadingCounts(false);
          return;
        }
        const rid = ontList[0].rid;
        const objectTypes = [
          "Customer",
          "Technician",
          "ServiceJob",
          "TreatmentProduct",
          "Invoice",
          "Vehicle",
          "Schedule",
        ];
        const counts: Record<string, number> = {};
        await Promise.all(
          objectTypes.map(async (type) => {
            try {
              const res = await fetch(
                `${API_BASE_URL}/api/v2/ontologies/${rid}/objects/${type}?pageSize=1`,
                { headers },
              );
              const data = await res.json();
              counts[`obj-${type}`] = data.totalCount ?? data.data?.length ?? 0;
            } catch {
              /* skip */
            }
          }),
        );
        setObjectCounts(counts);
      } catch {
        /* skip */
      }
      setLoadingCounts(false);
    };
    fetchCounts();
  }, []);

  // Merge counts into nodes
  const nodes = useMemo(
    () =>
      NODES.map((n) => ({
        ...n,
        recordCount: objectCounts[n.id] ?? n.recordCount,
      })),
    [objectCounts],
  );

  // Group nodes by column
  const nodesByCol = useMemo(() => {
    const map: Record<NodeCategory, LineageNode[]> = {
      source: [],
      transform: [],
      object: [],
      application: [],
    };
    for (const n of nodes) map[n.category].push(n);
    return map;
  }, [nodes]);

  // Positions map
  const positions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) {
      map[n.id] = nodePos(n, nodesByCol[n.category]);
    }
    return map;
  }, [nodes, nodesByCol]);

  // Active (selected or hovered) lineage trace
  const activeId = selectedNodeId ?? hoveredNodeId;
  const lineage = useMemo(
    () => (activeId ? traceLineage(activeId, EDGES) : null),
    [activeId],
  );

  // Upstream / downstream lists for detail panel
  const upstream = useMemo(() => {
    if (!selectedNodeId) return [];
    const result: LineageNode[] = [];
    const visited = new Set<string>();
    const queue = [selectedNodeId];
    while (queue.length) {
      const cur = queue.pop()!;
      EDGES.forEach((e) => {
        if (e.target === cur && !visited.has(e.source)) {
          visited.add(e.source);
          const n = nodes.find((nd) => nd.id === e.source);
          if (n) result.push(n);
          queue.push(e.source);
        }
      });
    }
    return result;
  }, [selectedNodeId, nodes]);

  const downstream = useMemo(() => {
    if (!selectedNodeId) return [];
    const result: LineageNode[] = [];
    const visited = new Set<string>();
    const queue = [selectedNodeId];
    while (queue.length) {
      const cur = queue.pop()!;
      EDGES.forEach((e) => {
        if (e.source === cur && !visited.has(e.target)) {
          visited.add(e.target);
          const n = nodes.find((nd) => nd.id === e.target);
          if (n) result.push(n);
          queue.push(e.target);
        }
      });
    }
    return result;
  }, [selectedNodeId, nodes]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [selectedNodeId, nodes],
  );

  // Filter sidebar list
  const filteredNodes = useMemo(() => {
    if (!filterText) return nodes;
    const lower = filterText.toLowerCase();
    return nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(lower) ||
        n.category.toLowerCase().includes(lower),
    );
  }, [nodes, filterText]);

  // Tooltip handlers
  const handleNodeMouseEnter = useCallback(
    (node: LineageNode, e: React.MouseEvent) => {
      setHoveredNodeId(node.id);
      setTooltipInfo({ node, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleNodeMouseMove = useCallback(
    (node: LineageNode, e: React.MouseEvent) => {
      setTooltipInfo({ node, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
    setTooltipInfo(null);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Icon icon="data-lineage" size={24} color={Colors.BLUE3} />
        <h2 style={{ margin: 0 }}>Data Lineage</h2>
        <span style={{ color: Colors.GRAY3, fontSize: 13 }}>
          {nodes.length} nodes &middot; {EDGES.length} edges
        </span>
        {loadingCounts && <Spinner size={16} />}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* ---- Left Sidebar ---- */}
        <Card style={{ width: 230, flexShrink: 0, padding: 12 }}>
          <h4 style={{ margin: "0 0 10px" }}>Legend</h4>
          {COLUMN_ORDER.map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <div
                key={cat}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: meta.color,
                  }}
                />
                <Icon icon={meta.icon as any} size={12} color={meta.color} />
                <span style={{ fontSize: 13 }}>{meta.label}</span>
                <Tag minimal round style={{ marginLeft: "auto" }}>
                  {nodesByCol[cat].length}
                </Tag>
              </div>
            );
          })}
          <hr
            style={{
              margin: "12px 0",
              border: "none",
              borderTop: "1px solid #e1e8ed",
            }}
          />

          <h4 style={{ margin: "0 0 8px" }}>Nodes</h4>
          <InputGroup
            leftIcon="search"
            placeholder="Filter nodes..."
            small
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {filteredNodes.map((node) => {
              const meta = CATEGORY_META[node.category];
              const isActive = node.id === selectedNodeId;
              return (
                <div
                  key={node.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 6px",
                    marginBottom: 2,
                    borderRadius: 4,
                    cursor: "pointer",
                    background: isActive ? Colors.BLUE3 + "22" : "transparent",
                    border: isActive
                      ? `1px solid ${Colors.BLUE3}`
                      : "1px solid transparent",
                  }}
                  onClick={() =>
                    setSelectedNodeId(isActive ? null : node.id)
                  }
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      backgroundColor: meta.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {node.label}
                  </span>
                </div>
              );
            })}
          </div>
          <hr
            style={{
              margin: "12px 0",
              border: "none",
              borderTop: "1px solid #e1e8ed",
            }}
          />
          <Button
            small
            minimal
            icon="reset"
            text="Clear selection"
            onClick={() => {
              setSelectedNodeId(null);
              setFilterText("");
            }}
          />
        </Card>

        {/* ---- SVG Canvas ---- */}
        <Card style={{ flex: 1, padding: 0, overflow: "hidden" }}>
          <svg
            width={SVG_WIDTH}
            height={SVG_HEIGHT}
            style={{ display: "block" }}
            onClick={() => setSelectedNodeId(null)}
          >
            <defs>
              <marker
                id="lineage-arrow"
                viewBox="0 0 10 7"
                refX="10"
                refY="3.5"
                markerWidth="8"
                markerHeight="6"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#bbb" />
              </marker>
              <marker
                id="lineage-arrow-hl"
                viewBox="0 0 10 7"
                refX="10"
                refY="3.5"
                markerWidth="8"
                markerHeight="6"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#2B95D6" />
              </marker>
              {/* Column header backgrounds */}
              {COLUMN_ORDER.map((cat, i) => {
                const meta = CATEGORY_META[cat];
                return (
                  <linearGradient
                    key={cat}
                    id={`col-grad-${cat}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={meta.color}
                      stopOpacity="0.06"
                    />
                    <stop
                      offset="100%"
                      stopColor={meta.color}
                      stopOpacity="0.02"
                    />
                  </linearGradient>
                );
              })}
            </defs>

            {/* Column backgrounds */}
            {COLUMN_ORDER.map((cat, i) => {
              const meta = CATEGORY_META[cat];
              const colX = COL_PAD + i * COL_SPACING;
              return (
                <g key={cat}>
                  <rect
                    x={colX}
                    y={0}
                    width={COL_SPACING - 16}
                    height={SVG_HEIGHT}
                    fill={`url(#col-grad-${cat})`}
                    rx={6}
                  />
                  <text
                    x={colX + (COL_SPACING - 16) / 2}
                    y={22}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill={meta.color}
                    opacity={0.7}
                  >
                    {meta.label.toUpperCase()}S
                  </text>
                </g>
              );
            })}

            {/* Edges */}
            {EDGES.map((edge, i) => {
              const sp = positions[edge.source];
              const tp = positions[edge.target];
              if (!sp || !tp) return null;

              const isHighlighted = lineage?.edges.has(i) ?? false;
              const dimmed = activeId !== null && !isHighlighted;

              return (
                <path
                  key={i}
                  d={edgePath(sp.x, sp.y, tp.x, tp.y)}
                  fill="none"
                  stroke={isHighlighted ? "#2B95D6" : "#ccc"}
                  strokeWidth={isHighlighted ? 2.5 : 1}
                  strokeOpacity={dimmed ? 0.1 : isHighlighted ? 0.9 : 0.5}
                  markerEnd={
                    isHighlighted
                      ? "url(#lineage-arrow-hl)"
                      : "url(#lineage-arrow)"
                  }
                />
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;
              const meta = CATEGORY_META[node.category];
              const isSelected = node.id === selectedNodeId;
              const inLineage = lineage?.nodes.has(node.id) ?? false;
              const dimmed = activeId !== null && !inLineage;

              return (
                <g
                  key={node.id}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(
                      selectedNodeId === node.id ? null : node.id,
                    );
                  }}
                  onMouseEnter={(e) => handleNodeMouseEnter(node, e)}
                  onMouseMove={(e) => handleNodeMouseMove(node, e)}
                  onMouseLeave={handleNodeMouseLeave}
                >
                  {/* Selection glow */}
                  {isSelected && (
                    <rect
                      x={pos.x - 3}
                      y={pos.y - 3}
                      width={NODE_W + 6}
                      height={NODE_H + 6}
                      rx={NODE_RX + 2}
                      fill="none"
                      stroke="#2B95D6"
                      strokeWidth={3}
                      strokeOpacity={0.45}
                    />
                  )}
                  {/* Node rect */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={NODE_RX}
                    fill={dimmed ? "#f5f5f5" : "white"}
                    stroke={isSelected ? "#2B95D6" : meta.color}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeOpacity={dimmed ? 0.25 : 1}
                  />
                  {/* Color accent bar on left */}
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={5}
                    height={NODE_H}
                    rx={2}
                    fill={meta.color}
                    fillOpacity={dimmed ? 0.15 : 0.85}
                  />
                  {/* Label */}
                  <text
                    x={pos.x + 12}
                    y={pos.y + NODE_H / 2}
                    dominantBaseline="central"
                    fontSize={10.5}
                    fontWeight={500}
                    fill={dimmed ? Colors.GRAY4 : Colors.DARK_GRAY1}
                    pointerEvents="none"
                  >
                    {node.label.length > 19
                      ? node.label.slice(0, 17) + "..."
                      : node.label}
                  </text>
                  {/* Record count badge for object types */}
                  {node.category === "object" &&
                    node.recordCount !== null && (
                      <g>
                        <rect
                          x={pos.x + NODE_W - 30}
                          y={pos.y + 6}
                          width={24}
                          height={14}
                          rx={7}
                          fill={meta.color}
                          fillOpacity={dimmed ? 0.15 : 0.85}
                        />
                        <text
                          x={pos.x + NODE_W - 18}
                          y={pos.y + 13}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={8}
                          fontWeight={600}
                          fill="white"
                          pointerEvents="none"
                          opacity={dimmed ? 0.3 : 1}
                        >
                          {node.recordCount}
                        </text>
                      </g>
                    )}
                </g>
              );
            })}
          </svg>
        </Card>

        {/* ---- Right Detail Panel ---- */}
        {selectedNode ? (
          <Card
            style={{
              width: 280,
              flexShrink: 0,
              padding: 14,
              overflow: "auto",
              maxHeight: SVG_HEIGHT,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <Tag
                large
                style={{
                  backgroundColor: CATEGORY_META[selectedNode.category].color,
                  color: "white",
                }}
              >
                {CATEGORY_META[selectedNode.category].label}
              </Tag>
              <Button
                minimal
                small
                icon="cross"
                onClick={() => setSelectedNodeId(null)}
              />
            </div>

            <h3 style={{ margin: "4px 0 8px" }}>{selectedNode.label}</h3>
            <p style={{ fontSize: 12, color: Colors.GRAY3, margin: "0 0 12px" }}>
              {selectedNode.description}
            </p>

            {/* Metadata */}
            <div style={{ fontSize: 12, marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: Colors.GRAY3 }}>Last processed</span>
                <span>{formatTimestamp(selectedNode.lastUpdated)}</span>
              </div>
              {selectedNode.recordCount !== null && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: Colors.GRAY3 }}>Record count</span>
                  <Tag intent="primary" round minimal>
                    {selectedNode.recordCount.toLocaleString()}
                  </Tag>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: Colors.GRAY3 }}>Node type</span>
                <span>{CATEGORY_META[selectedNode.category].label}</span>
              </div>
            </div>

            {/* Upstream */}
            <h5 style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: 4 }}>
              <Icon icon="arrow-left" size={12} />
              Upstream ({upstream.length})
            </h5>
            {upstream.length === 0 ? (
              <p style={{ fontSize: 11, color: Colors.GRAY4, margin: "0 0 12px" }}>
                No upstream dependencies (root source)
              </p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {upstream.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      fontSize: 12,
                      padding: "4px 6px",
                      marginBottom: 2,
                      background: "#f5f8fa",
                      borderRadius: 4,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => setSelectedNodeId(n.id)}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        backgroundColor: CATEGORY_META[n.category].color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>{n.label}</span>
                    <Tag
                      minimal
                      round
                      style={{
                        fontSize: 9,
                        padding: "0 6px",
                        minHeight: 16,
                      }}
                    >
                      {CATEGORY_META[n.category].label}
                    </Tag>
                  </div>
                ))}
              </div>
            )}

            {/* Downstream */}
            <h5 style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: 4 }}>
              <Icon icon="arrow-right" size={12} />
              Downstream ({downstream.length})
            </h5>
            {downstream.length === 0 ? (
              <p style={{ fontSize: 11, color: Colors.GRAY4, margin: "0 0 12px" }}>
                No downstream consumers (terminal node)
              </p>
            ) : (
              <div style={{ marginBottom: 12 }}>
                {downstream.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      fontSize: 12,
                      padding: "4px 6px",
                      marginBottom: 2,
                      background: "#f5f8fa",
                      borderRadius: 4,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onClick={() => setSelectedNodeId(n.id)}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        backgroundColor: CATEGORY_META[n.category].color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>{n.label}</span>
                    <Tag
                      minimal
                      round
                      style={{
                        fontSize: 9,
                        padding: "0 6px",
                        minHeight: 16,
                      }}
                    >
                      {CATEGORY_META[n.category].label}
                    </Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <Card
            style={{
              width: 280,
              flexShrink: 0,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: Colors.GRAY3,
              textAlign: "center",
            }}
          >
            <Icon icon="selection" size={32} color={Colors.GRAY4} />
            <p style={{ marginTop: 12, fontSize: 13 }}>
              Click a node to inspect its upstream and downstream lineage.
            </p>
          </Card>
        )}
      </div>

      {/* Tooltip */}
      {tooltipInfo && !selectedNodeId && (
        <div
          style={{
            position: "fixed",
            left: tooltipInfo.x + 14,
            top: tooltipInfo.y - 10,
            background: Colors.DARK_GRAY1,
            color: "white",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: "none",
            zIndex: 9999,
            maxWidth: 240,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {tooltipInfo.node.label}
          </div>
          <div style={{ opacity: 0.7, marginBottom: 2 }}>
            Type: {CATEGORY_META[tooltipInfo.node.category].label}
          </div>
          <div style={{ opacity: 0.7, marginBottom: 2 }}>
            Updated: {formatTimestamp(tooltipInfo.node.lastUpdated)}
          </div>
          {tooltipInfo.node.recordCount !== null && (
            <div style={{ opacity: 0.7 }}>
              Records: {tooltipInfo.node.recordCount.toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
