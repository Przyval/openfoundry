import { useCallback, useEffect, useState } from "react";
import {
  Breadcrumbs,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  HTMLTable,
  Icon,
  InputGroup,
  Intent,
  NonIdealState,
  Spinner,
  Tag,
  Tree,
  type TreeNodeInfo,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ResourceType = "SPACE" | "PROJECT" | "FOLDER" | "ONTOLOGY" | "DATASET" | "PIPELINE";

interface CompassResource {
  rid: string;
  name: string;
  type: ResourceType;
  description?: string;
  parentRid?: string;
  path?: string;
  created?: string;
  /** Extra metadata shown in the details panel */
  metadata?: Record<string, string>;
}

interface CompassListResponse {
  data: CompassResource[];
}

/* ------------------------------------------------------------------ */
/*  Mock resource tree for offline mode                                */
/* ------------------------------------------------------------------ */

const MOCK_RESOURCES: CompassResource[] = [
  // Root
  {
    rid: "ri.compass.main.space.openfoundry",
    name: "OpenFoundry",
    type: "SPACE",
    description: "Root platform space for all OpenFoundry resources",
    path: "/OpenFoundry",
    created: "2026-01-15T08:00:00Z",
  },
  // Space
  {
    rid: "ri.compass.main.space.pest-control",
    name: "Pest Control Space",
    type: "SPACE",
    description: "Contains all resources for the Pest Control Management vertical",
    parentRid: "ri.compass.main.space.openfoundry",
    path: "/OpenFoundry/Pest Control Space",
    created: "2026-01-20T10:30:00Z",
  },
  // Project
  {
    rid: "ri.compass.main.project.pest-control",
    name: "Pest Control Project",
    type: "PROJECT",
    description: "Primary project housing the pest control ontology, datasets, and pipelines",
    parentRid: "ri.compass.main.space.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project",
    created: "2026-01-22T09:00:00Z",
  },
  // Ontology folder
  {
    rid: "ri.compass.main.folder.ontology",
    name: "Pest Control Management",
    type: "ONTOLOGY",
    description:
      "Domain ontology with 7 object types (Customer, Technician, ServiceJob, TreatmentProduct, Invoice, Vehicle, Schedule), 8 link types, and 4 action types. 47 seeded objects.",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/Pest Control Management",
    created: "2026-01-25T11:00:00Z",
    metadata: {
      "Object Types": "Customer, Technician, ServiceJob, TreatmentProduct, Invoice, Vehicle, Schedule",
      "Link Types": "CustomerHasJobs, CustomerHasInvoices, CustomerHasSchedules, TechnicianAssignedJobs, TechnicianDrivesVehicle, TechnicianHasSchedules, JobHasInvoice, ScheduleForJob",
      "Action Types": "CompleteServiceJob, ScheduleNewJob, AssignTechnician, ReorderProduct",
      "Total Objects": "47",
      "Total Links": "32",
    },
  },
  // Datasets
  {
    rid: "ri.compass.main.dataset.raw-jobs",
    name: "pest-control-raw-jobs",
    type: "DATASET",
    description: "Raw service job records ingested from the field operations system",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/pest-control-raw-jobs",
    created: "2026-02-01T08:00:00Z",
    metadata: { Format: "CSV / Parquet", Branch: "main", "Row Count": "~1,200 records" },
  },
  {
    rid: "ri.compass.main.dataset.customer-master",
    name: "pest-control-customer-master",
    type: "DATASET",
    description: "Master customer reference data with contract details and service addresses",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/pest-control-customer-master",
    created: "2026-02-01T08:05:00Z",
    metadata: { Format: "CSV / Parquet", Branch: "main", "Row Count": "8 customers" },
  },
  {
    rid: "ri.compass.main.dataset.product-inventory",
    name: "pest-control-product-inventory",
    type: "DATASET",
    description: "Treatment product inventory with stock levels and reorder thresholds",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/pest-control-product-inventory",
    created: "2026-02-01T08:10:00Z",
    metadata: { Format: "CSV / Parquet", Branch: "main", "Row Count": "8 products" },
  },
  {
    rid: "ri.compass.main.dataset.revenue-daily",
    name: "pest-control-revenue-daily",
    type: "DATASET",
    description: "Daily aggregated revenue figures from completed service jobs",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/pest-control-revenue-daily",
    created: "2026-02-01T08:15:00Z",
    metadata: { Format: "CSV / Parquet", Branch: "main", "Row Count": "~90 daily rows" },
  },
  {
    rid: "ri.compass.main.dataset.technician-perf",
    name: "pest-control-technician-performance",
    type: "DATASET",
    description: "Technician performance scorecard data with ratings and job counts",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/pest-control-technician-performance",
    created: "2026-02-01T08:20:00Z",
    metadata: { Format: "CSV / Parquet", Branch: "main", "Row Count": "5 technicians" },
  },
  // Pipelines
  {
    rid: "ri.compass.main.pipeline.revenue",
    name: "Revenue by Customer Type",
    type: "PIPELINE",
    description:
      "Aggregate invoice revenue by customer type (residential vs commercial), calculate totals and averages for monthly reporting",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/Revenue by Customer Type",
    created: "2026-02-10T09:00:00Z",
    metadata: {
      Schedule: "Daily (every 24h)",
      Input: "invoices, customers",
      Output: "revenue-by-customer-type",
      Status: "ACTIVE",
      Steps: "Filter Paid Invoices -> Join Customer Data -> Aggregate by Type -> Sort by Revenue",
    },
  },
  {
    rid: "ri.compass.main.pipeline.tech-perf",
    name: "Technician Performance Scorecard",
    type: "PIPELINE",
    description:
      "Calculate technician KPIs: avg customer rating, job completion rate, jobs per week. Used for quarterly performance review and bonus calculation",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/Technician Performance Scorecard",
    created: "2026-02-10T09:10:00Z",
    metadata: {
      Schedule: "Weekly (Monday 06:00)",
      Input: "service-jobs, technicians",
      Output: "technician-scorecard",
      Status: "ACTIVE",
      Steps: "Filter Completed Jobs -> Group by Technician -> Join Technician Profile -> Sort by Rating",
    },
  },
  {
    rid: "ri.compass.main.pipeline.low-stock",
    name: "Low Stock Alert Generator",
    type: "PIPELINE",
    description:
      "Filter products where current stock is below minimum threshold and approaching expiry. Generates reorder alerts for procurement team",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/Low Stock Alert Generator",
    created: "2026-02-10T09:20:00Z",
    metadata: {
      Schedule: "Hourly",
      Input: "treatment-products",
      Output: "low-stock-alerts",
      Status: "ACTIVE",
      Steps: "Map Stock Fields -> Filter Low Stock -> Sort by Urgency",
    },
  },
  {
    rid: "ri.compass.main.pipeline.churn-risk",
    name: "Customer Churn Risk Analysis",
    type: "PIPELINE",
    description:
      "Identify customers at risk of churning by analyzing job frequency, last service date, and satisfaction ratings",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/Customer Churn Risk Analysis",
    created: "2026-02-10T09:30:00Z",
    metadata: {
      Schedule: "Monthly (1st, 08:00)",
      Input: "customers, service-jobs",
      Output: "churn-risk-report",
      Status: "ACTIVE",
      Steps: "Join Jobs to Customers -> Aggregate per Customer -> Filter At-Risk -> Sort by Risk",
    },
  },
  {
    rid: "ri.compass.main.pipeline.schedule-opt",
    name: "Daily Schedule Optimizer",
    type: "PIPELINE",
    description:
      "Prepare optimized daily schedule by grouping jobs by region, assigning based on technician availability and specialization match",
    parentRid: "ri.compass.main.project.pest-control",
    path: "/OpenFoundry/Pest Control Space/Pest Control Project/Daily Schedule Optimizer",
    created: "2026-02-10T09:40:00Z",
    metadata: {
      Schedule: "Every 12h",
      Input: "service-jobs, technicians",
      Output: "optimized-schedule",
      Status: "ACTIVE",
      Steps: "Filter Upcoming Jobs -> Join Technician Data -> Remove Duplicate Assignments -> Sort by Date and Region",
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const RESOURCE_ICONS: Record<ResourceType, IconName> = {
  SPACE: "globe",
  PROJECT: "projects",
  FOLDER: "folder-close",
  ONTOLOGY: "data-connection",
  DATASET: "database",
  PIPELINE: "data-lineage",
};

const RESOURCE_INTENT: Record<ResourceType, Intent> = {
  SPACE: Intent.PRIMARY,
  PROJECT: Intent.SUCCESS,
  FOLDER: Intent.NONE,
  ONTOLOGY: Intent.WARNING,
  DATASET: Intent.PRIMARY,
  PIPELINE: Intent.SUCCESS,
};

function buildBreadcrumbs(path?: string) {
  if (!path) return [];
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => ({ text: segment }));
}

/** Group children by parentRid */
function childrenOf(parentRid: string, resources: CompassResource[]): CompassResource[] {
  return resources.filter((r) => r.parentRid === parentRid);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CompassExplorer() {
  const [selectedRid, setSelectedRid] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["ri.compass.main.space.openfoundry", "ri.compass.main.space.pest-control", "ri.compass.main.project.pest-control"]),
  );
  const [liveChildrenMap, setLiveChildrenMap] = useState<Record<string, CompassResource[]>>({});
  const [childrenLoading, setChildrenLoading] = useState<Set<string>>(new Set());

  /** Whether we're using the built-in mock tree (Compass API not available) */
  const [useMock, setUseMock] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CompassResource[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ResourceType>("FOLDER");
  const [newParent, setNewParent] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Move dialog
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Root resources — try to fetch from Compass API
  const { data: rootData, loading: rootLoading, error: rootError, refetch } =
    useApi<CompassListResponse>("/api/v2/compass/resources");

  // Detect whether Compass API is reachable
  useEffect(() => {
    if (rootError || (rootData && (!rootData.data || rootData.data.length === 0))) {
      setUseMock(true);
    } else if (rootData?.data && rootData.data.length > 0) {
      setUseMock(false);
    }
  }, [rootData, rootError]);

  const allResources = useMock ? MOCK_RESOURCES : (rootData?.data ?? []);
  const rootResources = useMock
    ? MOCK_RESOURCES.filter((r) => !r.parentRid)
    : (rootData?.data ?? []);

  // Selected resource detail
  const selectedResource =
    selectedRid
      ? allResources.find((r) => r.rid === selectedRid) ??
        Object.values(liveChildrenMap)
          .flat()
          .find((r) => r.rid === selectedRid) ??
        searchResults?.find((r) => r.rid === selectedRid) ??
        null
      : null;

  /* ---- Fetch children (live mode) ---- */
  const fetchChildren = useCallback(async (rid: string) => {
    setChildrenLoading((prev) => new Set(prev).add(rid));
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v2/compass/resources/${rid}/children`,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.ok) {
        const json = (await res.json()) as CompassListResponse;
        setLiveChildrenMap((prev) => ({ ...prev, [rid]: json.data }));
      }
    } finally {
      setChildrenLoading((prev) => {
        const next = new Set(prev);
        next.delete(rid);
        return next;
      });
    }
  }, []);

  /* ---- Search ---- */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    if (useMock) {
      // Search locally in mock data
      const q = searchQuery.toLowerCase();
      setSearchResults(
        MOCK_RESOURCES.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.description ?? "").toLowerCase().includes(q),
        ),
      );
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v2/compass/search?q=${encodeURIComponent(searchQuery)}`,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.ok) {
        const json = (await res.json()) as CompassListResponse;
        setSearchResults(json.data);
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery, useMock]);

  /* ---- Build tree nodes ---- */

  /** Recursively build tree from mock resources */
  const buildMockChildNodes = useCallback(
    (parentRid: string): TreeNodeInfo[] => {
      const children = childrenOf(parentRid, MOCK_RESOURCES);
      // Group children by type for visual ordering
      const typeOrder: ResourceType[] = ["SPACE", "PROJECT", "ONTOLOGY", "DATASET", "PIPELINE", "FOLDER"];
      children.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));

      return children.map((child) => {
        const grandchildren = childrenOf(child.rid, MOCK_RESOURCES);
        const isExpanded = expandedIds.has(child.rid);
        return {
          id: child.rid,
          label: (
            <span style={{ fontWeight: child.type === "PROJECT" || child.type === "SPACE" ? 600 : 400 }}>
              {child.name}
            </span>
          ),
          icon: RESOURCE_ICONS[child.type],
          isSelected: child.rid === selectedRid,
          isExpanded,
          hasCaret: grandchildren.length > 0,
          childNodes: isExpanded ? buildMockChildNodes(child.rid) : [],
          secondaryLabel: (
            <Tag minimal round intent={RESOURCE_INTENT[child.type]} style={{ fontSize: "0.65rem" }}>
              {child.type}
            </Tag>
          ),
        };
      });
    },
    [expandedIds, selectedRid],
  );

  /** Build tree from live API data */
  const buildLiveChildNodes = useCallback(
    (parentRid: string): TreeNodeInfo[] => {
      const children = liveChildrenMap[parentRid];
      if (!children) return [];
      return children.map((child) => ({
        id: child.rid,
        label: child.name,
        icon: RESOURCE_ICONS[child.type] ?? "folder-close",
        isSelected: child.rid === selectedRid,
        isExpanded: expandedIds.has(child.rid),
        hasCaret: true,
        childNodes: expandedIds.has(child.rid) ? buildLiveChildNodes(child.rid) : [],
        secondaryLabel: childrenLoading.has(child.rid) ? (
          <Spinner size={14} />
        ) : (
          <Tag minimal round intent={RESOURCE_INTENT[child.type] ?? Intent.NONE} style={{ fontSize: "0.65rem" }}>
            {child.type}
          </Tag>
        ),
      }));
    },
    [liveChildrenMap, selectedRid, expandedIds, childrenLoading],
  );

  const treeNodes: TreeNodeInfo[] = useMock
    ? rootResources.map((r) => {
        const children = childrenOf(r.rid, MOCK_RESOURCES);
        const isExpanded = expandedIds.has(r.rid);
        return {
          id: r.rid,
          label: <strong>{r.name}</strong>,
          icon: RESOURCE_ICONS[r.type],
          isSelected: r.rid === selectedRid,
          isExpanded,
          hasCaret: children.length > 0,
          childNodes: isExpanded ? buildMockChildNodes(r.rid) : [],
          secondaryLabel: (
            <Tag minimal round intent={Intent.PRIMARY} style={{ fontSize: "0.65rem" }}>
              {r.type}
            </Tag>
          ),
        };
      })
    : rootResources.map((r) => ({
        id: r.rid,
        label: r.name,
        icon: RESOURCE_ICONS[r.type] ?? "folder-close",
        isSelected: r.rid === selectedRid,
        isExpanded: expandedIds.has(r.rid),
        hasCaret: true,
        childNodes: expandedIds.has(r.rid) ? buildLiveChildNodes(r.rid) : [],
        secondaryLabel: childrenLoading.has(r.rid) ? (
          <Spinner size={14} />
        ) : (
          <Tag minimal round intent={RESOURCE_INTENT[r.type] ?? Intent.NONE} style={{ fontSize: "0.65rem" }}>
            {r.type}
          </Tag>
        ),
      }));

  const handleNodeClick = useCallback((node: TreeNodeInfo) => {
    setSelectedRid(String(node.id));
  }, []);

  const handleNodeExpand = useCallback(
    (node: TreeNodeInfo) => {
      const rid = String(node.id);
      setExpandedIds((prev) => new Set(prev).add(rid));
      if (!useMock && !liveChildrenMap[rid]) {
        fetchChildren(rid);
      }
    },
    [useMock, liveChildrenMap, fetchChildren],
  );

  const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
    const rid = String(node.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(rid);
      return next;
    });
  }, []);

  /* ---- Create ---- */
  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/compass/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          type: newType,
          parentRid: newParent || undefined,
          description: newDescription || undefined,
        }),
      });
      setCreateOpen(false);
      setNewName("");
      setNewType("FOLDER");
      setNewParent("");
      setNewDescription("");
      refetch();
      if (newParent) {
        fetchChildren(newParent);
      }
    } finally {
      setCreating(false);
    }
  }, [newName, newType, newParent, newDescription, refetch, fetchChildren]);

  /* ---- Move ---- */
  const handleMove = useCallback(async () => {
    if (!selectedRid) return;
    setMoving(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/compass/resources/${selectedRid}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newParentRid: moveTarget }),
      });
      setMoveOpen(false);
      setMoveTarget("");
      refetch();
      if (selectedResource?.parentRid) {
        fetchChildren(selectedResource.parentRid);
      }
      if (moveTarget) {
        fetchChildren(moveTarget);
      }
    } finally {
      setMoving(false);
    }
  }, [selectedRid, moveTarget, refetch, fetchChildren, selectedResource]);

  /* ---- Delete ---- */
  const handleDelete = useCallback(async () => {
    if (!selectedRid) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/compass/resources/${selectedRid}`, {
        method: "DELETE",
      });
      setDeleteOpen(false);
      setSelectedRid(null);
      refetch();
      if (selectedResource?.parentRid) {
        fetchChildren(selectedResource.parentRid);
      }
    } finally {
      setDeleting(false);
    }
  }, [selectedRid, refetch, fetchChildren, selectedResource]);

  /* ---- Detail panel for selected resource ---- */
  const renderDetailPanel = () => {
    if (!selectedResource) {
      return (
        <NonIdealState
          icon="select"
          title="Select a resource"
          description="Choose a resource from the tree to view its details."
        />
      );
    }

    return (
      <Card style={{ padding: 20 }}>
        {selectedResource.path && (
          <div style={{ marginBottom: 12 }}>
            <Breadcrumbs items={buildBreadcrumbs(selectedResource.path)} />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Icon
            icon={RESOURCE_ICONS[selectedResource.type]}
            size={24}
            style={{ color: "#137CBD" }}
          />
          <h3 style={{ margin: 0 }}>{selectedResource.name}</h3>
        </div>

        <Tag intent={RESOURCE_INTENT[selectedResource.type]} style={{ marginBottom: 12 }}>
          {selectedResource.type}
        </Tag>

        {selectedResource.description && (
          <p style={{ color: "#5c7080", marginTop: 8, lineHeight: 1.6 }}>
            {selectedResource.description}
          </p>
        )}

        {/* Metadata table */}
        {selectedResource.metadata && Object.keys(selectedResource.metadata).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: "0.9rem", color: "#394B59" }}>
              Properties
            </h4>
            <HTMLTable bordered compact striped style={{ width: "100%", fontSize: "0.85rem" }}>
              <tbody>
                {Object.entries(selectedResource.metadata).map(([key, val]) => (
                  <tr key={key}>
                    <td style={{ fontWeight: 600, whiteSpace: "nowrap", width: 140, color: "#5C7080" }}>{key}</td>
                    <td>{val}</td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </div>
        )}

        {/* Children summary */}
        {useMock && (
          (() => {
            const children = childrenOf(selectedResource.rid, MOCK_RESOURCES);
            if (children.length === 0) return null;
            return (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "0.9rem", color: "#394B59" }}>
                  Contains {children.length} resource{children.length !== 1 ? "s" : ""}
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {children.map((c) => (
                    <Tag
                      key={c.rid}
                      interactive
                      minimal
                      round
                      icon={RESOURCE_ICONS[c.type] as IconName}
                      intent={RESOURCE_INTENT[c.type]}
                      onClick={() => {
                        setSelectedRid(c.rid);
                        setExpandedIds((prev) => new Set(prev).add(selectedResource.rid));
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {c.name}
                    </Tag>
                  ))}
                </div>
              </div>
            );
          })()
        )}

        <div
          style={{
            marginTop: 16,
            fontSize: "0.85rem",
            color: "#8a9ba8",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            borderTop: "1px solid #E1E8ED",
            paddingTop: 12,
          }}
        >
          <div>
            <strong>RID:</strong> <code style={{ fontSize: "0.8rem" }}>{selectedResource.rid}</code>
          </div>
          {selectedResource.created && (
            <div>
              <strong>Created:</strong>{" "}
              {new Date(selectedResource.created).toLocaleString()}
            </div>
          )}
          {selectedResource.parentRid && (
            <div>
              <strong>Parent:</strong>{" "}
              <code style={{ fontSize: "0.8rem" }}>{selectedResource.parentRid}</code>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title="Compass Explorer"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {useMock && (
              <Tag intent={Intent.WARNING} icon="offline" round>
                Offline Mode
              </Tag>
            )}
            {!useMock && (
              <>
                <Button
                  icon="add"
                  intent={Intent.PRIMARY}
                  text="Create"
                  onClick={() => setCreateOpen(true)}
                />
                <Button
                  icon="move"
                  text="Move"
                  disabled={!selectedRid}
                  onClick={() => setMoveOpen(true)}
                />
                <Button
                  icon="trash"
                  intent={Intent.DANGER}
                  text="Delete"
                  disabled={!selectedRid}
                  onClick={() => setDeleteOpen(true)}
                />
              </>
            )}
          </div>
        }
      />

      {/* Search bar */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <InputGroup
          leftIcon="search"
          placeholder="Search resources..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={{ flex: 1 }}
        />
        <Button
          text="Search"
          loading={searching}
          onClick={handleSearch}
        />
        {searchResults !== null && (
          <Button
            minimal
            icon="cross"
            onClick={() => {
              setSearchQuery("");
              setSearchResults(null);
            }}
          />
        )}
      </div>

      {/* Search results overlay */}
      {searchResults !== null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h4 style={{ margin: 0 }}>
            Search Results ({searchResults.length})
          </h4>
          {searchResults.length === 0 ? (
            <NonIdealState icon="search" title="No results found" />
          ) : (
            searchResults.map((r) => (
              <Card
                key={r.rid}
                interactive
                style={{
                  padding: "10px 14px",
                  border:
                    r.rid === selectedRid
                      ? "2px solid #2b95d6"
                      : undefined,
                }}
                onClick={() => {
                  setSelectedRid(r.rid);
                  setSearchResults(null);
                  setSearchQuery("");
                  // expand parents so the node is visible
                  if (r.parentRid) {
                    setExpandedIds((prev) => {
                      const next = new Set(prev);
                      // Walk up the tree to expand all ancestors
                      let current = r.parentRid;
                      while (current) {
                        next.add(current);
                        const parent = MOCK_RESOURCES.find((m) => m.rid === current);
                        current = parent?.parentRid;
                      }
                      return next;
                    });
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon icon={RESOURCE_ICONS[r.type]} size={16} />
                  <Tag minimal intent={RESOURCE_INTENT[r.type]}>{r.type}</Tag>
                  <strong>{r.name}</strong>
                </div>
                {r.description && (
                  <div style={{ fontSize: "0.82rem", color: "#5c7080", marginTop: 4 }}>
                    {r.description.length > 120 ? r.description.slice(0, 120) + "..." : r.description}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      ) : (
        /* Two-panel layout */
        <div className="two-panel">
          {/* Left: tree navigator */}
          <Card className="two-panel__left">
            {rootLoading && !useMock ? (
              <Spinner size={30} />
            ) : treeNodes.length === 0 ? (
              <NonIdealState icon="folder-open" title="No resources" />
            ) : (
              <Tree
                contents={treeNodes}
                onNodeClick={handleNodeClick}
                onNodeExpand={handleNodeExpand}
                onNodeCollapse={handleNodeCollapse}
              />
            )}
          </Card>

          {/* Right: resource details */}
          <div className="two-panel__right">
            {renderDetailPanel()}
          </div>
        </div>
      )}

      {/* Create Resource Dialog */}
      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Resource"
      >
        <DialogBody>
          <FormGroup label="Name" labelFor="cr-name">
            <InputGroup
              id="cr-name"
              placeholder="My Resource"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Type" labelFor="cr-type">
            <div className="bp5-html-select">
              <select
                id="cr-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as ResourceType)}
              >
                <option value="SPACE">Space</option>
                <option value="PROJECT">Project</option>
                <option value="FOLDER">Folder</option>
              </select>
              <span className="bp5-icon bp5-icon-double-caret-vertical" />
            </div>
          </FormGroup>
          <FormGroup label="Parent RID (optional)" labelFor="cr-parent">
            <InputGroup
              id="cr-parent"
              placeholder="ri.compass.main.folder...."
              value={newParent}
              onChange={(e) => setNewParent(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Description (optional)" labelFor="cr-desc">
            <InputGroup
              id="cr-desc"
              placeholder="Optional description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setCreateOpen(false)} />
              <Button
                intent={Intent.PRIMARY}
                text="Create"
                loading={creating}
                disabled={!newName}
                onClick={handleCreate}
              />
            </>
          }
        />
      </Dialog>

      {/* Move Resource Dialog */}
      <Dialog
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Move Resource"
      >
        <DialogBody>
          <p>
            Moving <strong>{selectedResource?.name}</strong> to a new parent.
          </p>
          <FormGroup label="New Parent RID" labelFor="mv-target">
            <InputGroup
              id="mv-target"
              placeholder="ri.compass.main.folder...."
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setMoveOpen(false)} />
              <Button
                intent={Intent.PRIMARY}
                text="Move"
                loading={moving}
                disabled={!moveTarget}
                onClick={handleMove}
              />
            </>
          }
        />
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Resource"
      >
        <DialogBody>
          <p>
            Are you sure you want to delete{" "}
            <strong>{selectedResource?.name}</strong>? This action cannot be
            undone.
          </p>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setDeleteOpen(false)} />
              <Button
                intent={Intent.DANGER}
                text="Delete"
                loading={deleting}
                onClick={handleDelete}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}
