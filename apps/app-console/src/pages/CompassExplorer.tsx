import { useCallback, useEffect, useState } from "react";
import {
  Breadcrumbs,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  InputGroup,
  Intent,
  NonIdealState,
  Spinner,
  Tag,
  Tree,
  type TreeNodeInfo,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ResourceType = "SPACE" | "PROJECT" | "FOLDER";

interface CompassResource {
  rid: string;
  name: string;
  type: ResourceType;
  description?: string;
  parentRid?: string;
  path?: string;
  created?: string;
}

interface CompassListResponse {
  data: CompassResource[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const RESOURCE_ICONS: Record<ResourceType, "globe" | "projects" | "folder-close"> = {
  SPACE: "globe",
  PROJECT: "projects",
  FOLDER: "folder-close",
};

function buildBreadcrumbs(path?: string) {
  if (!path) return [];
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => ({ text: segment }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CompassExplorer() {
  const [selectedRid, setSelectedRid] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = useState<Record<string, CompassResource[]>>({});
  const [childrenLoading, setChildrenLoading] = useState<Set<string>>(new Set());

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

  // Root resources
  const { data: rootData, loading: rootLoading, refetch } =
    useApi<CompassListResponse>("/api/v2/compass/resources");

  const rootResources = rootData?.data ?? [];

  // Selected resource detail
  const selectedResource =
    selectedRid
      ? rootResources.find((r) => r.rid === selectedRid) ??
        Object.values(childrenMap)
          .flat()
          .find((r) => r.rid === selectedRid) ??
        searchResults?.find((r) => r.rid === selectedRid) ??
        null
      : null;

  /* ---- Fetch children ---- */
  const fetchChildren = useCallback(async (rid: string) => {
    setChildrenLoading((prev) => new Set(prev).add(rid));
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v2/compass/resources/${rid}/children`,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.ok) {
        const json = (await res.json()) as CompassListResponse;
        setChildrenMap((prev) => ({ ...prev, [rid]: json.data }));
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
  }, [searchQuery]);

  /* ---- Build tree nodes ---- */
  const buildChildNodes = useCallback(
    (parentRid: string): TreeNodeInfo[] => {
      const children = childrenMap[parentRid];
      if (!children) return [];
      return children.map((child) => ({
        id: child.rid,
        label: child.name,
        icon: RESOURCE_ICONS[child.type],
        isSelected: child.rid === selectedRid,
        isExpanded: expandedIds.has(child.rid),
        hasCaret: child.type !== "FOLDER" || true,
        childNodes: expandedIds.has(child.rid) ? buildChildNodes(child.rid) : [],
        secondaryLabel: childrenLoading.has(child.rid) ? (
          <Spinner size={14} />
        ) : undefined,
      }));
    },
    [childrenMap, selectedRid, expandedIds, childrenLoading],
  );

  const treeNodes: TreeNodeInfo[] = rootResources.map((r) => ({
    id: r.rid,
    label: r.name,
    icon: RESOURCE_ICONS[r.type],
    isSelected: r.rid === selectedRid,
    isExpanded: expandedIds.has(r.rid),
    hasCaret: true,
    childNodes: expandedIds.has(r.rid) ? buildChildNodes(r.rid) : [],
    secondaryLabel: childrenLoading.has(r.rid) ? (
      <Spinner size={14} />
    ) : undefined,
  }));

  const handleNodeClick = useCallback((node: TreeNodeInfo) => {
    setSelectedRid(String(node.id));
  }, []);

  const handleNodeExpand = useCallback(
    (node: TreeNodeInfo) => {
      const rid = String(node.id);
      setExpandedIds((prev) => new Set(prev).add(rid));
      if (!childrenMap[rid]) {
        fetchChildren(rid);
      }
    },
    [childrenMap, fetchChildren],
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
      // Refresh parent's children if applicable
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
      // Refresh relevant subtrees
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

  return (
    <>
      <PageHeader
        title="Compass Explorer"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
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
                onClick={() => setSelectedRid(r.rid)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tag minimal>{r.type}</Tag>
                  <strong>{r.name}</strong>
                </div>
                {r.path && (
                  <div style={{ fontSize: "0.82rem", color: "#5c7080", marginTop: 4 }}>
                    {r.path}
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
            {rootLoading ? (
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
            {!selectedResource ? (
              <NonIdealState
                icon="select"
                title="Select a resource"
                description="Choose a resource from the tree to view its details."
              />
            ) : (
              <Card style={{ padding: 20 }}>
                {selectedResource.path && (
                  <div style={{ marginBottom: 12 }}>
                    <Breadcrumbs items={buildBreadcrumbs(selectedResource.path)} />
                  </div>
                )}
                <h3 style={{ margin: "0 0 8px" }}>{selectedResource.name}</h3>
                <Tag intent={Intent.PRIMARY} style={{ marginBottom: 12 }}>
                  {selectedResource.type}
                </Tag>
                {selectedResource.description && (
                  <p style={{ color: "#5c7080", marginTop: 8 }}>
                    {selectedResource.description}
                  </p>
                )}
                <div
                  style={{
                    marginTop: 16,
                    fontSize: "0.85rem",
                    color: "#8a9ba8",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div>
                    <strong>RID:</strong> <code>{selectedResource.rid}</code>
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
                      <code>{selectedResource.parentRid}</code>
                    </div>
                  )}
                </div>
              </Card>
            )}
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
