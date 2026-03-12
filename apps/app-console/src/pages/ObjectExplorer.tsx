import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Card,
  Divider,
  FormGroup,
  HTMLSelect,
  InputGroup,
  NonIdealState,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import DataTable, { type ColumnDef } from "../components/DataTable";
import PaginationControls from "../components/PaginationControls";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OntologyListResponse {
  data: Array<{ rid: string; apiName: string; displayName: string }>;
}

interface ObjectTypeListResponse {
  data: Array<{ apiName: string; properties: Record<string, { type: string }> }>;
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

function buildWhereClause(filters: FilterRule[]): Record<string, unknown> | null {
  const clauses = filters
    .filter((f) => f.field && (f.operator === "isNull" || f.value))
    .map((f) => {
      if (f.operator === "isNull") {
        return { type: "isNull", field: f.field };
      }
      // Try to parse as number
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
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageTokens, setPageTokens] = useState<string[]>([]);
  const [objects, setObjects] = useState<OntologyObject[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [aggData, setAggData] = useState<AggregationGroup[] | null>(null);

  const currentToken = pageTokens[pageTokens.length - 1] ?? "";

  // -- Fetch ontologies & object types -------------------------------------
  const { data: ontologiesData } = useApi<OntologyListResponse>(
    "/api/v2/ontologies",
  );
  const ontologies = ontologiesData?.data ?? [];

  const { data: objectTypesData } = useApi<ObjectTypeListResponse>(
    ontologyRid
      ? `/api/v2/ontologies/${ontologyRid}/objectTypes`
      : "",
  );
  const objectTypes = objectTypesData?.data ?? [];

  // -- Determine property fields ------------------------------------------
  const selectedObjectTypeDef = objectTypes.find(
    (ot) => ot.apiName === objectType,
  );
  const propertyFields = useMemo(
    () =>
      selectedObjectTypeDef
        ? Object.keys(selectedObjectTypeDef.properties)
        : [],
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
        pageSize: 50,
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
            pageSize: 50,
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

  // -- Build columns -------------------------------------------------------
  const columns: ColumnDef<OntologyObject>[] = useMemo(() => {
    if (objects.length === 0 && propertyFields.length === 0) return [];

    const fields =
      propertyFields.length > 0
        ? propertyFields
        : objects.length > 0
          ? Object.keys(objects[0].properties)
          : [];

    return [
      {
        key: "__primaryKey",
        header: "Primary Key",
        sortable: true,
        render: (row: OntologyObject) => row.primaryKey,
      },
      ...fields.map((key) => ({
        key,
        header: key,
        sortable: true,
        render: (row: OntologyObject) => String(row.properties[key] ?? ""),
      })),
    ];
  }, [objects, propertyFields]);

  // -- Render --------------------------------------------------------------
  return (
    <>
      <PageHeader
        title="Object Explorer"
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

      {/* Selector bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <FormGroup label="Ontology" inline>
          <HTMLSelect
            value={ontologyRid}
            onChange={(e) => {
              setOntologyRid(e.target.value);
              setObjectType("");
              setObjects([]);
              setPageTokens([]);
            }}
          >
            <option value="">-- Select --</option>
            {ontologies.map((o) => (
              <option key={o.rid} value={o.rid}>
                {o.displayName || o.apiName}
              </option>
            ))}
          </HTMLSelect>
        </FormGroup>

        <FormGroup label="Object Type" inline>
          <HTMLSelect
            value={objectType}
            onChange={(e) => {
              setObjectType(e.target.value);
              setObjects([]);
              setPageTokens([]);
              setFilters([]);
            }}
            disabled={!ontologyRid}
          >
            <option value="">-- Select --</option>
            {objectTypes.map((ot) => (
              <option key={ot.apiName} value={ot.apiName}>
                {ot.apiName}
              </option>
            ))}
          </HTMLSelect>
        </FormGroup>
      </div>

      {!ontologyRid || !objectType ? (
        <NonIdealState
          icon="search"
          title="Select an ontology and object type"
          description="Choose an ontology and object type above to explore objects."
        />
      ) : (
        <div style={{ display: "flex", gap: 16 }}>
          {/* Filter sidebar */}
          <Card style={{ width: 300, flexShrink: 0, padding: 12 }}>
            <h4 style={{ margin: "0 0 8px" }}>Search</h4>
            <InputGroup
              leftIcon="search"
              placeholder="Full-text search..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPageTokens([]);
              }}
              style={{ marginBottom: 12 }}
            />

            <Divider />

            <h4 style={{ margin: "8px 0" }}>
              Filters
              <Button
                minimal
                small
                icon="plus"
                onClick={addFilter}
                style={{ float: "right" }}
              />
            </h4>

            {filters.map((filter, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 4,
                  marginBottom: 6,
                  alignItems: "center",
                }}
              >
                <HTMLSelect
                  value={filter.field}
                  onChange={(e) => updateFilter(idx, { field: e.target.value })}
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
                  style={{ width: 80 }}
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

            {filters.length > 0 && (
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
            )}

            <Divider style={{ margin: "12px 0" }} />

            <h4 style={{ margin: "8px 0" }}>Sort</h4>
            <div style={{ display: "flex", gap: 4 }}>
              <HTMLSelect
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                style={{ flex: 1 }}
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
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                style={{ width: 70 }}
              >
                <option value="asc">ASC</option>
                <option value="desc">DESC</option>
              </HTMLSelect>
            </div>

            {/* Aggregation panel */}
            {aggData && aggData.length > 0 && (
              <>
                <Divider style={{ margin: "12px 0" }} />
                <h4 style={{ margin: "8px 0" }}>Aggregations</h4>
                {Object.entries(aggData[0].metrics).map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{key}</span>
                    <Tag minimal round>
                      {typeof val === "number"
                        ? val.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : String(val)}
                    </Tag>
                  </div>
                ))}
              </>
            )}
          </Card>

          {/* Main data area */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <Tag minimal>
                {totalCount} object{totalCount !== 1 ? "s" : ""}
              </Tag>
            </div>

            {loading ? (
              <Spinner size={40} />
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={objects}
                  rowKey={(row) => row.rid}
                  emptyMessage="No objects found"
                />
                <PaginationControls
                  hasPrevious={pageTokens.length > 0}
                  hasNext={!!nextPageToken}
                  onPrevious={handlePrevPage}
                  onNext={handleNextPage}
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
