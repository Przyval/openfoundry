import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  ButtonGroup,
  Card,
  Colors,
  HTMLSelect,
  NonIdealState,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import { API_BASE_URL } from "../config";

/* ---------- types ---------- */

interface OntologyObject {
  primaryKey: string;
  objectType: string;
  properties: Record<string, unknown>;
}

interface LinkInstance {
  sourceObjectType: string;
  sourcePrimaryKey: string;
  linkType: string;
  targetObjectType: string;
  targetPrimaryKey: string;
}

interface LinkTypeDef {
  apiName: string;
  objectTypeApiName: string;
  linkedObjectTypeApiName: string;
  cardinality: string;
}

interface GraphNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  linkType: string;
}

/* ---------- color map ---------- */

const TYPE_COLORS: Record<string, string> = {
  Customer: "#2965CC",
  Technician: "#29A634",
  ServiceJob: "#D99E0B",
  TreatmentProduct: "#D13913",
  Invoice: "#8F398F",
  Vehicle: "#00B3A4",
  Schedule: "#DB2C6F",
};

const NODE_RADIUS = 22;
const LABEL_OFFSET = 30;

function getColor(type: string): string {
  return TYPE_COLORS[type] ?? "#738091";
}

function getNodeLabel(obj: OntologyObject): string {
  const p = obj.properties;
  return (
    (p.name as string) ??
    (p.displayName as string) ??
    (p.plateNumber as string) ??
    obj.primaryKey
  );
}

/* ---------- force simulation ---------- */

function applyForces(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
) {
  const alpha = 0.3;
  const centerX = width / 2;
  const centerY = height / 2;

  // Gravity toward center
  for (const n of nodes) {
    if (n.fx !== undefined) continue;
    n.vx += (centerX - n.x) * 0.005;
    n.vy += (centerY - n.y) * 0.005;
  }

  // Repulsion between nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minDist = 100;
      if (dist < minDist) {
        const force = ((minDist - dist) / dist) * 0.5;
        dx *= force;
        dy *= force;
        if (a.fx === undefined) { a.vx -= dx; a.vy -= dy; }
        if (b.fx === undefined) { b.vx += dx; b.vy += dy; }
      }
    }
  }

  // Edge spring forces
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ideal = 160;
    const force = ((dist - ideal) / dist) * 0.03;
    dx *= force;
    dy *= force;
    if (a.fx === undefined) { a.vx += dx; a.vy += dy; }
    if (b.fx === undefined) { b.vx -= dx; b.vy -= dy; }
  }

  // Apply velocities
  for (const n of nodes) {
    if (n.fx !== undefined) {
      n.x = n.fx;
      n.y = n.fy!;
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx *= 0.85; // damping
    n.vy *= 0.85;
    n.x += n.vx * alpha;
    n.y += n.vy * alpha;
    // Keep within bounds
    n.x = Math.max(NODE_RADIUS + 5, Math.min(width - NODE_RADIUS - 5, n.x));
    n.y = Math.max(NODE_RADIUS + 5, Math.min(height - NODE_RADIUS - 5, n.y));
  }
}

/* ---------- main component ---------- */

export default function NetworkGraph() {
  const [ontologyRid, setOntologyRid] = useState("");
  const [ontologies, setOntologies] = useState<{ rid: string; apiName: string }[]>([]);
  const [allObjects, setAllObjects] = useState<OntologyObject[]>([]);
  const [linkTypes, setLinkTypes] = useState<LinkTypeDef[]>([]);
  const [links, setLinks] = useState<LinkInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

  // Graph state
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const [, forceRender] = useState(0);
  const animRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const WIDTH = 1200;
  const HEIGHT = 700;

  const token = localStorage.getItem("token") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Fetch ontologies on mount
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v2/ontologies`, { headers })
      .then((r) => r.json())
      .then((d) => {
        const list = d.data ?? [];
        setOntologies(list);
        if (list.length > 0) setOntologyRid(list[0].rid);
      })
      .catch(() => {});
  }, []);

  // Fetch objects + links when ontology selected
  useEffect(() => {
    if (!ontologyRid) return;
    setLoading(true);

    const fetchAll = async () => {
      // Get metadata (object types + link types)
      const metaRes = await fetch(
        `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/fullMetadata`,
        { headers },
      );
      const meta = await metaRes.json();
      const objectTypeNames: string[] = (meta.objectTypes ?? []).map(
        (ot: { apiName: string }) => ot.apiName,
      );
      setLinkTypes(meta.linkTypes ?? []);

      // Fetch all objects of every type
      const objectPromises = objectTypeNames.map(async (typeName) => {
        const res = await fetch(
          `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objects/${typeName}?pageSize=100`,
          { headers },
        );
        const data = await res.json();
        return (data.data ?? []).map((o: any) => ({
          ...o,
          objectType: typeName,
        }));
      });
      const allObjArrays = await Promise.all(objectPromises);
      const objs: OntologyObject[] = allObjArrays.flat();
      setAllObjects(objs);

      // Fetch all links for each link type
      const allLinks: LinkInstance[] = [];
      for (const lt of meta.linkTypes ?? []) {
        const sourceType = lt.objectTypeApiName;
        const sourceObjs = objs.filter((o) => o.objectType === sourceType);
        for (const sObj of sourceObjs) {
          try {
            const res = await fetch(
              `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objects/${sourceType}/${sObj.primaryKey}/links/${lt.apiName}`,
              { headers },
            );
            const data = await res.json();
            if (data.data) allLinks.push(...data.data);
          } catch {
            // skip
          }
        }
      }
      setLinks(allLinks);
      setLoading(false);
    };

    fetchAll().catch(() => setLoading(false));
  }, [ontologyRid]);

  // Build graph from objects + links
  useEffect(() => {
    if (allObjects.length === 0) return;

    // Group objects by type for initial positioning
    const typeGroups = new Map<string, OntologyObject[]>();
    for (const obj of allObjects) {
      const arr = typeGroups.get(obj.objectType) ?? [];
      arr.push(obj);
      typeGroups.set(obj.objectType, arr);
    }

    const types = Array.from(typeGroups.keys());
    const nodes: GraphNode[] = [];
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;

    types.forEach((type, typeIdx) => {
      const angle = (typeIdx / types.length) * 2 * Math.PI;
      const groupCx = cx + Math.cos(angle) * 200;
      const groupCy = cy + Math.sin(angle) * 200;
      const objs = typeGroups.get(type)!;
      objs.forEach((obj, objIdx) => {
        const spread = (objIdx / Math.max(objs.length - 1, 1) - 0.5) * 120;
        nodes.push({
          id: `${obj.objectType}:${obj.primaryKey}`,
          type: obj.objectType,
          label: getNodeLabel(obj),
          x: groupCx + spread * Math.cos(angle + Math.PI / 2),
          y: groupCy + spread * Math.sin(angle + Math.PI / 2),
          vx: 0,
          vy: 0,
        });
      });
    });

    const edges: GraphEdge[] = links.map((link) => ({
      source: `${link.sourceObjectType}:${link.sourcePrimaryKey}`,
      target: `${link.targetObjectType}:${link.targetPrimaryKey}`,
      linkType: link.linkType,
    }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
    forceRender((n) => n + 1);
  }, [allObjects, links]);

  // Force simulation loop
  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      if (nodesRef.current.length > 0) {
        applyForces(nodesRef.current, edgesRef.current, WIDTH, HEIGHT);
        forceRender((n) => n + 1);
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [allObjects]);

  // Drag handlers
  const handleMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingNode(nodeId);
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!draggingNode || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const node = nodesRef.current.find((n) => n.id === draggingNode);
      if (node) {
        node.fx = x;
        node.fy = y;
        node.x = x;
        node.y = y;
      }
    },
    [draggingNode],
  );

  const handleMouseUp = useCallback(() => {
    if (draggingNode) {
      const node = nodesRef.current.find((n) => n.id === draggingNode);
      if (node) {
        delete node.fx;
        delete node.fy;
      }
      setDraggingNode(null);
    }
  }, [draggingNode]);

  // Visible nodes/edges filtering
  const visibleNodes = useMemo(
    () => nodesRef.current.filter((n) => !hiddenTypes.has(n.type)),
    [nodesRef.current, hiddenTypes],
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () =>
      edgesRef.current.filter(
        (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target),
      ),
    [edgesRef.current, visibleNodeIds],
  );

  // Connected edges for selected/hovered node
  const highlightedEdges = useMemo(() => {
    const activeNode = selectedNode ?? hoveredNode;
    if (!activeNode) return new Set<number>();
    const set = new Set<number>();
    visibleEdges.forEach((e, i) => {
      if (e.source === activeNode || e.target === activeNode) set.add(i);
    });
    return set;
  }, [selectedNode, hoveredNode, visibleEdges]);

  const connectedNodes = useMemo(() => {
    const activeNode = selectedNode ?? hoveredNode;
    if (!activeNode) return new Set<string>();
    const set = new Set<string>();
    set.add(activeNode);
    visibleEdges.forEach((e) => {
      if (e.source === activeNode) set.add(e.target);
      if (e.target === activeNode) set.add(e.source);
    });
    return set;
  }, [selectedNode, hoveredNode, visibleEdges]);

  const activeNode = selectedNode ?? hoveredNode;

  // Type counts
  const typeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of nodesRef.current) {
      map[n.type] = (map[n.type] ?? 0) + 1;
    }
    return map;
  }, [nodesRef.current]);

  const toggleType = (type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Selected node details
  const selectedObjDetail = useMemo(() => {
    if (!selectedNode) return null;
    const [type, pk] = selectedNode.split(":");
    return allObjects.find(
      (o) => o.objectType === type && o.primaryKey === pk,
    );
  }, [selectedNode, allObjects]);

  const selectedNodeLinks = useMemo(() => {
    if (!selectedNode) return [];
    return visibleEdges.filter(
      (e) => e.source === selectedNode || e.target === selectedNode,
    );
  }, [selectedNode, visibleEdges]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <Spinner size={50} />
        <p style={{ marginTop: 16 }}>Loading network graph data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>Network Graph</h2>
        {ontologies.length > 1 && (
          <HTMLSelect
            value={ontologyRid}
            onChange={(e) => setOntologyRid(e.target.value)}
          >
            {ontologies.map((o) => (
              <option key={o.rid} value={o.rid}>
                {o.apiName}
              </option>
            ))}
          </HTMLSelect>
        )}
        <span style={{ color: Colors.GRAY3, fontSize: 13 }}>
          {visibleNodes.length} nodes, {visibleEdges.length} edges
        </span>
      </div>

      {allObjects.length === 0 ? (
        <NonIdealState
          icon="graph"
          title="No data"
          description="Seed the pest control data first."
        />
      ) : (
        <div style={{ display: "flex", gap: 16 }}>
          {/* Legend / filter */}
          <Card style={{ width: 220, flexShrink: 0, padding: 12 }}>
            <h4 style={{ margin: "0 0 10px" }}>Object Types</h4>
            {Object.entries(typeCounts).map(([type, count]) => (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  cursor: "pointer",
                  opacity: hiddenTypes.has(type) ? 0.35 : 1,
                }}
                onClick={() => toggleType(type)}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    backgroundColor: getColor(type),
                  }}
                />
                <span style={{ flex: 1, fontSize: 13 }}>{type}</span>
                <Tag minimal round>
                  {count}
                </Tag>
              </div>
            ))}
            <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid #e1e8ed" }} />
            <h4 style={{ margin: "0 0 10px" }}>Link Types</h4>
            {linkTypes.map((lt) => (
              <div key={lt.apiName} style={{ fontSize: 11, marginBottom: 4, color: Colors.GRAY3 }}>
                {lt.objectTypeApiName} → {lt.linkedObjectTypeApiName}
              </div>
            ))}
            <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid #e1e8ed" }} />
            <ButtonGroup minimal>
              <Button
                small
                icon="eye-open"
                text="Show all"
                onClick={() => setHiddenTypes(new Set())}
              />
              <Button
                small
                icon="reset"
                text="Reset"
                onClick={() => {
                  setSelectedNode(null);
                  setHiddenTypes(new Set());
                }}
              />
            </ButtonGroup>
          </Card>

          {/* SVG Canvas */}
          <Card style={{ flex: 1, padding: 0, overflow: "hidden" }}>
            <svg
              ref={svgRef}
              width={WIDTH}
              height={HEIGHT}
              style={{ display: "block", cursor: draggingNode ? "grabbing" : "default" }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={() => setSelectedNode(null)}
            >
              <defs>
                <marker
                  id="arrowhead"
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
                  id="arrowhead-hl"
                  viewBox="0 0 10 7"
                  refX="10"
                  refY="3.5"
                  markerWidth="8"
                  markerHeight="6"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#2B95D6" />
                </marker>
              </defs>

              {/* Edges */}
              {visibleEdges.map((edge, i) => {
                const sourceNode = nodesRef.current.find(
                  (n) => n.id === edge.source,
                );
                const targetNode = nodesRef.current.find(
                  (n) => n.id === edge.target,
                );
                if (!sourceNode || !targetNode) return null;

                const isHighlighted = highlightedEdges.has(i);
                const dimmed = activeNode && !isHighlighted;

                // Shorten line to stop at node edge
                const dx = targetNode.x - sourceNode.x;
                const dy = targetNode.y - sourceNode.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / dist;
                const uy = dy / dist;

                return (
                  <line
                    key={i}
                    x1={sourceNode.x + ux * NODE_RADIUS}
                    y1={sourceNode.y + uy * NODE_RADIUS}
                    x2={targetNode.x - ux * (NODE_RADIUS + 8)}
                    y2={targetNode.y - uy * (NODE_RADIUS + 8)}
                    stroke={isHighlighted ? "#2B95D6" : "#ccc"}
                    strokeWidth={isHighlighted ? 2.5 : 1}
                    strokeOpacity={dimmed ? 0.15 : 1}
                    markerEnd={
                      isHighlighted ? "url(#arrowhead-hl)" : "url(#arrowhead)"
                    }
                  />
                );
              })}

              {/* Nodes */}
              {visibleNodes.map((node) => {
                const isActive = node.id === (selectedNode ?? hoveredNode);
                const isConnected = connectedNodes.has(node.id);
                const dimmed = activeNode && !isConnected;

                return (
                  <g
                    key={node.id}
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(node.id, e);
                    }}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(
                        selectedNode === node.id ? null : node.id,
                      );
                    }}
                  >
                    {/* Glow ring for active node */}
                    {isActive && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS + 6}
                        fill="none"
                        stroke="#2B95D6"
                        strokeWidth={3}
                        strokeOpacity={0.5}
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={NODE_RADIUS}
                      fill={getColor(node.type)}
                      fillOpacity={dimmed ? 0.2 : 1}
                      stroke={isActive ? "#2B95D6" : "#fff"}
                      strokeWidth={isActive ? 3 : 2}
                    />
                    {/* Primary key abbreviation inside circle */}
                    <text
                      x={node.x}
                      y={node.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={9}
                      fontWeight="bold"
                      fill="white"
                      pointerEvents="none"
                      opacity={dimmed ? 0.3 : 1}
                    >
                      {node.id.split(":")[1]?.replace(/^[A-Z]+-/, "")}
                    </text>
                    {/* Label below */}
                    <text
                      x={node.x}
                      y={node.y + LABEL_OFFSET}
                      textAnchor="middle"
                      fontSize={10}
                      fill={dimmed ? "#ccc" : Colors.DARK_GRAY1}
                      pointerEvents="none"
                    >
                      {node.label.length > 18
                        ? node.label.slice(0, 16) + "..."
                        : node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </Card>

          {/* Detail panel */}
          {selectedObjDetail && (
            <Card style={{ width: 280, flexShrink: 0, padding: 12, overflow: "auto", maxHeight: HEIGHT }}>
              <h4 style={{ margin: "0 0 4px" }}>
                <Tag intent="primary" round>
                  {selectedObjDetail.objectType}
                </Tag>
              </h4>
              <h3 style={{ margin: "8px 0" }}>
                {getNodeLabel(selectedObjDetail)}
              </h3>
              <p style={{ color: Colors.GRAY3, fontSize: 12 }}>
                {selectedObjDetail.primaryKey}
              </p>

              <h5 style={{ marginTop: 12, marginBottom: 6 }}>Properties</h5>
              <table style={{ fontSize: 12, width: "100%" }}>
                <tbody>
                  {Object.entries(selectedObjDetail.properties).map(
                    ([key, val]) => (
                      <tr key={key}>
                        <td
                          style={{
                            color: Colors.GRAY3,
                            paddingRight: 8,
                            paddingBottom: 4,
                            whiteSpace: "nowrap",
                            verticalAlign: "top",
                          }}
                        >
                          {key}
                        </td>
                        <td style={{ paddingBottom: 4, wordBreak: "break-word" }}>
                          {String(val ?? "-")}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>

              {selectedNodeLinks.length > 0 && (
                <>
                  <h5 style={{ marginTop: 12, marginBottom: 6 }}>
                    Connected ({selectedNodeLinks.length})
                  </h5>
                  {selectedNodeLinks.map((edge, i) => {
                    const otherId =
                      edge.source === selectedNode
                        ? edge.target
                        : edge.source;
                    const otherNode = nodesRef.current.find(
                      (n) => n.id === otherId,
                    );
                    return (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          marginBottom: 4,
                          padding: "4px 6px",
                          background: "#f5f8fa",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                        onClick={() => setSelectedNode(otherId)}
                      >
                        <Tag
                          minimal
                          round
                          style={{
                            backgroundColor: getColor(
                              otherId.split(":")[0],
                            ),
                            color: "white",
                            marginRight: 6,
                          }}
                        >
                          {otherId.split(":")[0]}
                        </Tag>
                        {otherNode?.label ?? otherId.split(":")[1]}
                        <div
                          style={{
                            fontSize: 10,
                            color: Colors.GRAY3,
                            marginTop: 2,
                          }}
                        >
                          via {edge.linkType}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
