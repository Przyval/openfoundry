import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Callout,
  Card,
  Divider,
  FormGroup,
  HTMLSelect,
  HTMLTable,
  InputGroup,
  Intent,
  NonIdealState,
  Spinner,
  Tab,
  Tabs,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import PaginationControls from "../components/PaginationControls";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OntologyListResponse {
  data: Array<{ rid: string; apiName: string; displayName: string }>;
}

interface ObjectTypeMetadata {
  apiName: string;
  displayName?: string;
  properties: Record<string, { type: string; displayName?: string }>;
  primaryKey: string;
}

interface FullMetadataResponse {
  objectTypes: ObjectTypeMetadata[];
}

interface OntologyObject {
  rid: string;
  objectType: string;
  primaryKey: string;
  properties: Record<string, unknown>;
}

interface LoadObjectsResponse {
  data: OntologyObject[];
  totalCount: number;
  nextPageToken?: string;
}

interface AggregationGroup {
  group: Record<string, unknown>;
  metrics: Record<string, number>;
}

interface AggregateResponse {
  data: AggregationGroup[];
}

interface FilterRule {
  field: string;
  operator: string;
  value: string;
}

interface LinkTypeDef {
  apiName: string;
  displayName?: string;
  objectTypeApiName?: string;
}

interface LinkTypeListResponse {
  data: LinkTypeDef[];
}

interface LinkedObjectsResponse {
  data: OntologyObject[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPERATORS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "isNull", label: "is null" },
];

/** Format integers with Indonesian locale (period as thousands separator). */
function formatInteger(value: unknown): string {
  if (value === null || value === undefined) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  if (!Number.isInteger(num)) return num.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return num.toLocaleString("id-ID");
}

/** Map of status keywords to Blueprint intent colors. */
const STATUS_INTENT_MAP: Record<string, "success" | "none" | "primary" | "warning" | "danger"> = {
  active: "success",
  inactive: "none",
  completed: "primary",
  scheduled: "warning",
  emergency: "danger",
  "in-progress": "warning",
  "in_progress": "warning",
  "inprogress": "warning",
};

/** Check if a field name looks like a status field. */
function isStatusField(fieldName: string): boolean {
  const lower = fieldName.toLowerCase();
  return lower.includes("status") || lower === "state" || lower.includes("_status");
}

/** Render a status value as a colored Tag, or return null if not a recognized status. */
function renderStatusTag(value: unknown): React.ReactNode | null {
  if (value === null || value === undefined || value === "") return null;
  const strVal = String(value).toLowerCase().trim();
  const intent = STATUS_INTENT_MAP[strVal];
  if (intent !== undefined) {
    return (
      <Tag intent={intent} round minimal>
        {String(value)}
      </Tag>
    );
  }
  return null;
}

function buildWhereClause(filters: FilterRule[]): Record<string, unknown> | null {
  const clauses = filters
    .filter((f) => f.field && (f.operator === "isNull" || f.value))
    .map((f) => {
      if (f.operator === "isNull") {
        return { type: "isNull", field: f.field };
      }
      const numVal = Number(f.value);
      const val = !isNaN(numVal) && f.value.trim() !== "" ? numVal : f.value;
      return { type: f.operator, field: f.field, value: val };
    });

  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];
  return { type: "and", value: clauses };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ObjectExplorer() {
  // -- State ----------------------------------------------------------------
  const [ontologyRid, setOntologyRid] = useState("");
  const [objectType, setObjectType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageTokens, setPageTokens] = useState<string[]>([]);
  const [objects, setObjects] = useState<OntologyObject[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [aggData, setAggData] = useState<AggregationGroup[] | null>(null);
  const [objectTypeCounts, setObjectTypeCounts] = useState<Record<string, number>>({});

  // -- Selected object detail view ------------------------------------------
  const [selectedObject, setSelectedObject] = useState<OntologyObject | null>(null);
  const [linkTypes, setLinkTypes] = useState<LinkTypeDef[]>([]);
  const [linkedObjectsMap, setLinkedObjectsMap] = useState<Record<string, OntologyObject[]>>({});
  const [linkTypesLoading, setLinkTypesLoading] = useState(false);
  const [linkedObjectsLoading, setLinkedObjectsLoading] = useState<Record<string, boolean>>({});

  // -- Column sorting (client-side click on header) -------------------------
  const [tableSortCol, setTableSortCol] = useState<string | null>(null);
  const [tableSortAsc, setTableSortAsc] = useState(true);

  const currentToken = pageTokens[pageTokens.length - 1] ?? "";

  // -- Fetch ontologies -----------------------------------------------------
  const { data: ontologiesData } = useApi<OntologyListResponse>(
    "/api/v2/ontologies",
  );
  const ontologies = ontologiesData?.data ?? [];

  // -- Auto-select ontology when there's exactly one --------------------------
  useEffect(() => {
    if (ontologies.length === 1 && !ontologyRid) {
      setOntologyRid(ontologies[0].rid);
    }
  }, [ontologies, ontologyRid]);

  // -- Fetch full metadata for object types ---------------------------------
  const { data: fullMetadata, loading: metadataLoading } = useApi<FullMetadataResponse>(
    ontologyRid ? `/api/v2/ontologies/${ontologyRid}/fullMetadata` : "",
  );

  const objectTypes = useMemo(
    () => (fullMetadata?.objectTypes ?? []).filter((ot: any) => ot && ot.apiName),
    [fullMetadata],
  );

  // -- Determine property fields from metadata ------------------------------
  const selectedObjectTypeDef = useMemo(
    () => objectTypes.find((ot: any) => ot.apiName === objectType),
    [objectTypes, objectType],
  );

  const propertyFields = useMemo(
    () => (selectedObjectTypeDef ? Object.keys(selectedObjectTypeDef.properties) : []),
    [selectedObjectTypeDef],
  );

  const numericFields = useMemo(
    () =>
      selectedObjectTypeDef
        ? Object.entries(selectedObjectTypeDef.properties)
            .filter(
              ([, def]) =>
                def.type === "INTEGER" ||
                def.type === "DOUBLE" ||
                def.type === "FLOAT" ||
                def.type === "LONG",
            )
            .map(([key]) => key)
        : [],
    [selectedObjectTypeDef],
  );

  const integerFields = useMemo(
    () =>
      selectedObjectTypeDef
        ? new Set(
            Object.entries(selectedObjectTypeDef.properties)
              .filter(([, def]) => def.type === "INTEGER" || def.type === "LONG")
              .map(([key]) => key),
          )
        : new Set<string>(),
    [selectedObjectTypeDef],
  );

  const numericFieldSet = useMemo(
    () =>
      selectedObjectTypeDef
        ? new Set(
            Object.entries(selectedObjectTypeDef.properties)
              .filter(
                ([, def]) =>
                  def.type === "INTEGER" ||
                  def.type === "DOUBLE" ||
                  def.type === "FLOAT" ||
                  def.type === "LONG",
              )
              .map(([key]) => key),
          )
        : new Set<string>(),
    [selectedObjectTypeDef],
  );

  // -- Fetch object counts for each type ------------------------------------
  useEffect(() => {
    if (!ontologyRid || objectTypes.length === 0) {
      setObjectTypeCounts({});
      return;
    }

    let cancelled = false;

    async function fetchCounts() {
      const counts: Record<string, number> = {};
      // Fetch counts in parallel, best-effort
      const promises = objectTypes.map(async (ot) => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/aggregate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                objectSet: { type: "base", objectType: ot.apiName },
                aggregation: [{ type: "count", name: "count" }],
              }),
            },
          );
          if (res.ok) {
            const data = (await res.json()) as AggregateResponse;
            const count = data.data?.[0]?.metrics?.count;
            if (typeof count === "number") {
              counts[ot.apiName] = count;
            }
          }
        } catch {
          // best-effort
        }
      });

      await Promise.all(promises);
      if (!cancelled) {
        setObjectTypeCounts(counts);
      }
    }

    void fetchCounts();
    return () => {
      cancelled = true;
    };
  }, [ontologyRid, objectTypes]);

  // -- Fetch objects -------------------------------------------------------
  const fetchObjects = useCallback(async () => {
    if (!ontologyRid || !objectType) return;
    setLoading(true);

    try {
      const objectSetDef: Record<string, unknown> = {
        type: "base",
        objectType,
      };

      const where = buildWhereClause(filters);
      const body: Record<string, unknown> = {
        objectSet: where
          ? { type: "filter", objectSet: objectSetDef, where }
          : objectSetDef,
        pageSize: 100,
      };

      if (currentToken) {
        body.pageToken = currentToken;
      }
      if (sortField) {
        body.orderBy = [{ field: sortField, direction: sortDir }];
      }

      // Use search endpoint if query is present
      const endpoint = searchQuery
        ? `/api/v2/ontologies/${ontologyRid}/objectSets/search`
        : `/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`;

      const requestBody = searchQuery
        ? {
            objectSet: body.objectSet,
            query: searchQuery,
            fields: propertyFields.length > 0 ? propertyFields : undefined,
            orderBy: sortField
              ? { field: sortField, direction: sortDir }
              : undefined,
            pageSize: 100,
            pageToken: currentToken || undefined,
          }
        : body;

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as LoadObjectsResponse;
      setObjects(data.data);
      setTotalCount(data.totalCount);
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      console.error("Failed to fetch objects:", err);
      setObjects([]);
    } finally {
      setLoading(false);
    }
  }, [
    ontologyRid,
    objectType,
    filters,
    searchQuery,
    sortField,
    sortDir,
    currentToken,
    propertyFields,
  ]);

  useEffect(() => {
    void fetchObjects();
  }, [fetchObjects]);

  // -- Fetch aggregations --------------------------------------------------
  const fetchAggregations = useCallback(async () => {
    if (!ontologyRid || !objectType || numericFields.length === 0) {
      setAggData(null);
      return;
    }

    try {
      const aggregation = [
        { type: "count", name: "count" },
        ...numericFields.slice(0, 3).flatMap((f) => [
          { type: "avg", field: f, name: `avg_${f}` },
          { type: "sum", field: f, name: `sum_${f}` },
        ]),
      ];

      const res = await fetch(
        `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/aggregate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectSet: { type: "base", objectType },
            aggregation,
          }),
        },
      );

      if (!res.ok) return;
      const data = (await res.json()) as AggregateResponse;
      setAggData(data.data);
    } catch {
      // Aggregation is best-effort
    }
  }, [ontologyRid, objectType, numericFields]);

  useEffect(() => {
    void fetchAggregations();
  }, [fetchAggregations]);

  // -- Fetch link types when an object is selected --------------------------
  useEffect(() => {
    if (!selectedObject || !ontologyRid) {
      setLinkTypes([]);
      setLinkedObjectsMap({});
      return;
    }

    let cancelled = false;
    setLinkTypesLoading(true);

    async function fetchLinkTypes() {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectTypes/${selectedObject!.objectType}/outgoingLinkTypes`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LinkTypeListResponse;
        if (!cancelled) {
          setLinkTypes(data.data ?? []);
        }
      } catch {
        if (!cancelled) setLinkTypes([]);
      } finally {
        if (!cancelled) setLinkTypesLoading(false);
      }
    }

    void fetchLinkTypes();
    return () => { cancelled = true; };
  }, [selectedObject, ontologyRid]);

  const fetchLinkedObjects = useCallback(
    async (linkTypeApiName: string) => {
      if (!selectedObject || !ontologyRid) return;

      setLinkedObjectsLoading((prev) => ({ ...prev, [linkTypeApiName]: true }));

      try {
        const pk = encodeURIComponent(selectedObject.primaryKey);
        const res = await fetch(
          `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objects/${selectedObject.objectType}/${pk}/links/${linkTypeApiName}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LinkedObjectsResponse;
        setLinkedObjectsMap((prev) => ({ ...prev, [linkTypeApiName]: data.data ?? [] }));
      } catch {
        setLinkedObjectsMap((prev) => ({ ...prev, [linkTypeApiName]: [] }));
      } finally {
        setLinkedObjectsLoading((prev) => ({ ...prev, [linkTypeApiName]: false }));
      }
    },
    [selectedObject, ontologyRid],
  );

  // Auto-fetch linked objects for each link type once they're loaded
  useEffect(() => {
    if (linkTypes.length === 0 || !selectedObject) return;
    for (const lt of linkTypes) {
      if (!(lt.apiName in linkedObjectsMap)) {
        void fetchLinkedObjects(lt.apiName);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkTypes, selectedObject]);

  const handleSelectObject = useCallback((obj: OntologyObject) => {
    setSelectedObject(obj);
    setLinkedObjectsMap({});
    setLinkTypes([]);
  }, []);

  const handleBackToTable = useCallback(() => {
    setSelectedObject(null);
    setLinkedObjectsMap({});
    setLinkTypes([]);
  }, []);

  // -- Handlers ------------------------------------------------------------
  const addFilter = () =>
    setFilters((prev) => [...prev, { field: "", operator: "eq", value: "" }]);

  const removeFilter = (index: number) =>
    setFilters((prev) => prev.filter((_, i) => i !== index));

  const updateFilter = (index: number, updates: Partial<FilterRule>) =>
    setFilters((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f)),
    );

  const handlePrevPage = useCallback(
    () => setPageTokens((t) => t.slice(0, -1)),
    [],
  );
  const handleNextPage = useCallback(() => {
    if (nextPageToken) {
      setPageTokens((t) => [...t, nextPageToken]);
    }
  }, [nextPageToken]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(objects, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${objectType || "objects"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [objects, objectType]);

  const handleHeaderSort = useCallback(
    (key: string) => {
      if (tableSortCol === key) {
        setTableSortAsc((a) => !a);
      } else {
        setTableSortCol(key);
        setTableSortAsc(true);
      }
    },
    [tableSortCol],
  );

  // -- Client-side filtering -----------------------------------------------
  const filteredObjects = useMemo(() => {
    if (!clientFilter.trim()) return objects;
    const q = clientFilter.toLowerCase();
    return objects.filter((obj) => {
      // Search primary key
      if (obj.primaryKey?.toLowerCase().includes(q)) return true;
      // Search all properties
      return Object.values(obj.properties).some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      );
    });
  }, [objects, clientFilter]);

  // -- Client-side sorting -------------------------------------------------
  const sortedObjects = useMemo(() => {
    if (!tableSortCol) return filteredObjects;
    const sorted = [...filteredObjects];
    sorted.sort((a, b) => {
      let aVal: unknown;
      let bVal: unknown;
      if (tableSortCol === "__primaryKey") {
        aVal = a.primaryKey;
        bVal = b.primaryKey;
      } else {
        aVal = a.properties[tableSortCol];
        bVal = b.properties[tableSortCol];
      }
      // Handle nulls
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      // Numeric comparison
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
        return tableSortAsc ? aNum - bNum : bNum - aNum;
      }
      // String comparison
      const cmp = String(aVal).localeCompare(String(bVal));
      return tableSortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [filteredObjects, tableSortCol, tableSortAsc]);

  // -- Build columns -------------------------------------------------------
  const columns = useMemo(() => {
    if (objects.length === 0 && propertyFields.length === 0) return [];

    const fields =
      propertyFields.length > 0
        ? propertyFields
        : objects.length > 0
          ? Object.keys(objects[0].properties)
          : [];

    return [
      { key: "__primaryKey", header: "Primary Key" },
      ...fields.map((key) => ({
        key,
        header: selectedObjectTypeDef?.properties[key]?.displayName || key,
      })),
    ];
  }, [objects, propertyFields, selectedObjectTypeDef]);

  /** Render a cell value with formatting. */
  const renderCellValue = useCallback(
    (key: string, value: unknown): React.ReactNode => {
      if (value === null || value === undefined) {
        return <span style={{ color: "#999", fontStyle: "italic" }}>null</span>;
      }

      // Status fields: show colored tags
      if (isStatusField(key)) {
        const tag = renderStatusTag(value);
        if (tag) return tag;
      }

      // Integer / numeric fields: format with Indonesian locale
      if (integerFields.has(key) || numericFieldSet.has(key)) {
        return formatInteger(value);
      }

      return String(value);
    },
    [integerFields, numericFieldSet],
  );

  // -- Render --------------------------------------------------------------
  return (
    <>
      <PageHeader
        title="Object Explorer"
        subtitle="Browse and search objects across your ontology"
        actions={
          <ButtonGroup>
            <Button
              icon="export"
              text="Export JSON"
              disabled={objects.length === 0}
              onClick={handleExport}
            />
            <Button icon="refresh" text="Refresh" onClick={fetchObjects} />
          </ButtonGroup>
        }
      />

      {/* Ontology selector */}
      <div style={{ marginBottom: 12 }}>
        <FormGroup label="Ontology" inline>
          <HTMLSelect
            value={ontologyRid}
            onChange={(e) => {
              setOntologyRid(e.target.value);
              setObjectType("");
              setObjects([]);
              setPageTokens([]);
              setClientFilter("");
              setTableSortCol(null);
              setSelectedObject(null);
              setLinkedObjectsMap({});
              setLinkTypes([]);
            }}
          >
            <option value="">-- Select Ontology --</option>
            {ontologies.map((o) => (
              <option key={o.rid} value={o.rid}>
                {o.displayName || o.apiName}
              </option>
            ))}
          </HTMLSelect>
        </FormGroup>
      </div>

      {!ontologyRid ? (
        <NonIdealState
          icon="search"
          title="Select an ontology"
          description="Choose an ontology above to explore its object types and data."
        />
      ) : metadataLoading ? (
        <Spinner size={40} />
      ) : objectTypes.length === 0 ? (
        <NonIdealState
          icon="inbox-search"
          title="No object types found"
          description="This ontology does not contain any object types."
        />
      ) : (
        <div style={{ display: "flex", gap: 0 }}>
          {/* Object type sidebar with tabs */}
          <Card
            style={{
              width: 260,
              flexShrink: 0,
              padding: 0,
              marginRight: 16,
              overflow: "auto",
              maxHeight: "calc(100vh - 180px)",
            }}
          >
            <div style={{ padding: "12px 12px 4px" }}>
              <h4 style={{ margin: 0 }}>Object Types</h4>
            </div>
            <Tabs
              id="object-type-tabs"
              vertical
              selectedTabId={objectType || undefined}
              onChange={(newTabId) => {
                setObjectType(String(newTabId));
                setObjects([]);
                setPageTokens([]);
                setFilters([]);
                setClientFilter("");
                setSearchQuery("");
                setTableSortCol(null);
                setSortField("");
                setSelectedObject(null);
                setLinkedObjectsMap({});
                setLinkTypes([]);
              }}
              renderActiveTabPanelOnly
            >
              {objectTypes.map((ot) => {
                const name = ot.displayName || ot.apiName;
                const count = objectTypeCounts[ot.apiName];
                return (
                  <Tab
                    key={ot.apiName}
                    id={ot.apiName}
                    title={
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </span>
                        {count !== undefined && (
                          <Tag minimal round intent="none">
                            {count.toLocaleString("id-ID")}
                          </Tag>
                        )}
                      </span>
                    }
                    panel={<></>}
                  />
                );
              })}
            </Tabs>
          </Card>

          {/* Main content area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedObject ? (
              /* ---- Object Detail Panel ---- */
              <div>
                <Button
                  icon="arrow-left"
                  text="Back to list"
                  minimal
                  onClick={handleBackToTable}
                  style={{ marginBottom: 12 }}
                />

                <Card style={{ padding: 16, marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 4px" }}>
                    {selectedObject.objectType}{" "}
                    <Tag minimal round intent="primary" style={{ verticalAlign: "middle" }}>
                      {selectedObject.primaryKey}
                    </Tag>
                  </h3>

                  <h4 style={{ margin: "16px 0 8px" }}>Properties</h4>
                  <HTMLTable bordered compact striped style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ width: 200 }}>Property</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedObject.properties).map(([key, value]) => (
                        <tr key={key}>
                          <td>
                            <code style={{ fontSize: "0.85rem" }}>{key}</code>
                          </td>
                          <td>
                            {value === null || value === undefined ? (
                              <span style={{ color: "#999", fontStyle: "italic" }}>null</span>
                            ) : isStatusField(key) && renderStatusTag(value) ? (
                              renderStatusTag(value)
                            ) : integerFields.has(key) || numericFieldSet.has(key) ? (
                              formatInteger(value)
                            ) : (
                              String(value)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </HTMLTable>
                </Card>

                {/* Linked Objects Section */}
                <Card style={{ padding: 16 }}>
                  <h4 style={{ margin: "0 0 12px" }}>Linked Objects</h4>

                  {linkTypesLoading ? (
                    <Spinner size={30} />
                  ) : linkTypes.length === 0 ? (
                    <Callout intent={Intent.NONE} icon="info-sign">
                      No outgoing link types found for this object type.
                    </Callout>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {linkTypes.map((lt) => {
                        const linked = linkedObjectsMap[lt.apiName];
                        const isLoading = linkedObjectsLoading[lt.apiName];

                        return (
                          <div key={lt.apiName}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <strong>{lt.displayName || lt.apiName}</strong>
                              <Tag minimal round>
                                {linked ? linked.length : "..."}
                              </Tag>
                              <Button
                                minimal
                                small
                                icon="refresh"
                                onClick={() => fetchLinkedObjects(lt.apiName)}
                              />
                            </div>

                            {isLoading ? (
                              <Spinner size={20} />
                            ) : linked && linked.length === 0 ? (
                              <p style={{ color: "#888", margin: 0, fontSize: "0.85rem" }}>
                                No linked objects.
                              </p>
                            ) : linked ? (
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                                  gap: 8,
                                }}
                              >
                                {linked.map((linkedObj) => {
                                  // Show up to 4 property previews
                                  const previewProps = Object.entries(linkedObj.properties).slice(0, 4);
                                  return (
                                    <Card
                                      key={linkedObj.rid}
                                      interactive
                                      elevation={0}
                                      style={{ padding: "10px 12px", cursor: "pointer" }}
                                      onClick={() => handleSelectObject(linkedObj)}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <Tag minimal intent="primary" style={{ fontSize: "0.8rem" }}>
                                          {linkedObj.objectType}
                                        </Tag>
                                        <code style={{ fontSize: "0.75rem", color: "#5c7080" }}>
                                          {linkedObj.primaryKey}
                                        </code>
                                      </div>
                                      {previewProps.map(([k, v]) => (
                                        <div
                                          key={k}
                                          style={{ fontSize: "0.8rem", color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                        >
                                          <span style={{ color: "#888" }}>{k}:</span>{" "}
                                          {v === null || v === undefined ? (
                                            <span style={{ fontStyle: "italic", color: "#aaa" }}>null</span>
                                          ) : (
                                            String(v)
                                          )}
                                        </div>
                                      ))}
                                    </Card>
                                  );
                                })}
                              </div>
                            ) : null}

                            {lt !== linkTypes[linkTypes.length - 1] && <Divider style={{ margin: "12px 0 0" }} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            ) : !objectType ? (
              <NonIdealState
                icon="select"
                title="Select an object type"
                description="Choose an object type from the sidebar to view its data."
              />
            ) : (
              <>
                {/* Toolbar: search + filter + sort controls */}
                <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                  {/* Filter sidebar / controls */}
                  <Card style={{ flex: 1, padding: 12 }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                      {/* Client-side filter */}
                      <FormGroup label="Quick filter" style={{ margin: 0 }}>
                        <InputGroup
                          leftIcon="filter"
                          placeholder="Filter visible rows..."
                          value={clientFilter}
                          onChange={(e) => setClientFilter(e.target.value)}
                          style={{ width: 220 }}
                        />
                      </FormGroup>

                      {/* Server-side search */}
                      <FormGroup label="Server search" style={{ margin: 0 }}>
                        <InputGroup
                          leftIcon="search"
                          placeholder="Full-text search..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPageTokens([]);
                          }}
                          style={{ width: 220 }}
                        />
                      </FormGroup>

                      {/* Sort controls */}
                      <FormGroup label="Sort by" inline style={{ margin: 0 }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <HTMLSelect
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value)}
                            style={{ width: 140 }}
                          >
                            <option value="">None</option>
                            {propertyFields.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </HTMLSelect>
                          <HTMLSelect
                            value={sortDir}
                            onChange={(e) =>
                              setSortDir(e.target.value as "asc" | "desc")
                            }
                            style={{ width: 70 }}
                          >
                            <option value="asc">ASC</option>
                            <option value="desc">DESC</option>
                          </HTMLSelect>
                        </div>
                      </FormGroup>
                    </div>

                    {/* Advanced filters */}
                    {filters.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <Divider />
                        {filters.map((filter, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: "flex",
                              gap: 4,
                              marginBottom: 6,
                              alignItems: "center",
                              marginTop: idx === 0 ? 8 : 0,
                            }}
                          >
                            <HTMLSelect
                              value={filter.field}
                              onChange={(e) =>
                                updateFilter(idx, { field: e.target.value })
                              }
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              <option value="">Field</option>
                              {propertyFields.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </HTMLSelect>
                            <HTMLSelect
                              value={filter.operator}
                              onChange={(e) =>
                                updateFilter(idx, { operator: e.target.value })
                              }
                              style={{ width: 90 }}
                            >
                              {OPERATORS.map((op) => (
                                <option key={op.value} value={op.value}>
                                  {op.label}
                                </option>
                              ))}
                            </HTMLSelect>
                            {filter.operator !== "isNull" && (
                              <InputGroup
                                value={filter.value}
                                onChange={(e) =>
                                  updateFilter(idx, { value: e.target.value })
                                }
                                placeholder="Value"
                                style={{ flex: 1, minWidth: 0 }}
                                small
                              />
                            )}
                            <Button
                              minimal
                              small
                              icon="cross"
                              onClick={() => removeFilter(idx)}
                            />
                          </div>
                        ))}
                        <Button
                          small
                          intent="primary"
                          text="Apply Filters"
                          onClick={() => {
                            setPageTokens([]);
                            void fetchObjects();
                          }}
                          style={{ marginTop: 4 }}
                        />
                      </div>
                    )}

                    <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                      <Button
                        minimal
                        small
                        icon="plus"
                        text="Add Filter"
                        onClick={addFilter}
                      />
                      <Tag minimal>
                        {totalCount.toLocaleString("id-ID")} object{totalCount !== 1 ? "s" : ""}
                      </Tag>
                      {clientFilter && (
                        <Tag minimal intent="primary">
                          {sortedObjects.length.toLocaleString("id-ID")} shown
                        </Tag>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Aggregations */}
                {aggData && aggData.length > 0 && (
                  <Card style={{ padding: 12, marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {Object.entries(aggData[0].metrics).map(([key, val]) => (
                        <div key={key} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>
                            {key}
                          </div>
                          <Tag minimal round large>
                            {typeof val === "number"
                              ? val.toLocaleString("id-ID", {
                                  maximumFractionDigits: 2,
                                })
                              : String(val)}
                          </Tag>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Data table */}
                {loading ? (
                  <Spinner size={40} />
                ) : sortedObjects.length === 0 ? (
                  <NonIdealState
                    icon="search"
                    title="No objects found"
                    description={
                      clientFilter
                        ? "No objects match your filter. Try adjusting your search criteria."
                        : "No objects found for this object type."
                    }
                  />
                ) : (
                  <>
                    <div
                      style={{
                        overflowX: "auto",
                        maxWidth: "100%",
                        border: "1px solid #e1e1e1",
                        borderRadius: 4,
                      }}
                    >
                      <HTMLTable
                        bordered
                        compact
                        striped
                        interactive
                        style={{ width: "100%", minWidth: columns.length * 150 }}
                      >
                        <thead>
                          <tr>
                            {columns.map((col) => (
                              <th
                                key={col.key}
                                onClick={() => handleHeaderSort(col.key)}
                                style={{
                                  cursor: "pointer",
                                  userSelect: "none",
                                  whiteSpace: "nowrap",
                                  position: "sticky",
                                  top: 0,
                                  background: "#f5f5f5",
                                  zIndex: 1,
                                }}
                              >
                                {col.header}
                                {tableSortCol === col.key &&
                                  (tableSortAsc ? " \u25B2" : " \u25BC")}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedObjects.map((row) => (
                            <tr
                              key={row.rid}
                              onClick={() => handleSelectObject(row)}
                              style={{ cursor: "pointer" }}
                            >
                              {columns.map((col) => (
                                <td
                                  key={col.key}
                                  style={{
                                    whiteSpace: "nowrap",
                                    maxWidth: 300,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {col.key === "__primaryKey"
                                    ? row.primaryKey
                                    : renderCellValue(col.key, row.properties[col.key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </HTMLTable>
                    </div>
                    <PaginationControls
                      hasPrevious={pageTokens.length > 0}
                      hasNext={!!nextPageToken}
                      onPrevious={handlePrevPage}
                      onNext={handleNextPage}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
