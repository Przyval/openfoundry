import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  Elevation,
  FormGroup,
  HTMLSelect,
  Icon,
  InputGroup,
  Spinner,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import PageHeader from "../components/PageHeader";
import KPICardWidget from "../components/widgets/KPICardWidget";
import DataTableWidget from "../components/widgets/DataTableWidget";
import ChartWidget from "../components/widgets/ChartWidget";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WidgetType = "kpi" | "table" | "chart";

interface WidgetConfig {
  ontologyRid: string;
  objectType: string;
  // KPI-specific
  aggregationType?: "count" | "avg" | "sum" | "min" | "max";
  property?: string;
  color?: string;
  // Table-specific
  columns?: string[];
  pageSize?: number;
  // Chart-specific
  chartType?: "bar" | "line" | "pie";
  groupBy?: string;
}

interface PlacedWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: WidgetConfig;
}

interface PaletteEntry {
  type: WidgetType;
  label: string;
  icon: IconName;
  description: string;
}

const PALETTE: PaletteEntry[] = [
  { type: "kpi", label: "KPI Card", icon: "dashboard", description: "Single aggregated number" },
  { type: "table", label: "Data Table", icon: "th", description: "Paginated object table" },
  { type: "chart", label: "Chart", icon: "chart", description: "Bar, line, or pie chart" },
];

const STORAGE_KEY = "openfoundry-workshop-editor";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let _seq = 0;
function genId(): string {
  return `widget-${++_seq}-${Date.now()}`;
}

function defaultConfig(type: WidgetType): WidgetConfig {
  const base: WidgetConfig = { ontologyRid: "", objectType: "" };
  switch (type) {
    case "kpi":
      return { ...base, aggregationType: "count", color: "#2965CC" };
    case "table":
      return { ...base, columns: [], pageSize: 10 };
    case "chart":
      return { ...base, chartType: "bar", groupBy: "", aggregationType: "count" };
  }
}

/* ------------------------------------------------------------------ */
/*  Ontology fetching (for config panel dropdowns)                     */
/* ------------------------------------------------------------------ */

interface OntologyInfo {
  rid: string;
  apiName: string;
  displayName: string;
}

interface ObjectTypeInfo {
  apiName: string;
  displayName?: string;
  properties?: string[];
}

function useOntologies() {
  const [ontologies, setOntologies] = useState<OntologyInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/v2/ontologies`, {
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d) => {
        const items = (d.data ?? []).map((o: Record<string, unknown>) => ({
          rid: o.rid as string,
          apiName: o.apiName as string,
          displayName: (o.displayName ?? o.apiName) as string,
        }));
        setOntologies(items);
      })
      .catch(() => setOntologies([]))
      .finally(() => setLoading(false));
  }, []);

  return { ontologies, loading };
}

function useObjectTypes(ontologyRid: string) {
  const [types, setTypes] = useState<ObjectTypeInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ontologyRid) {
      setTypes([]);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectTypes`, {
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d) => {
        const items = (d.data ?? []).map((t: Record<string, unknown>) => ({
          apiName: t.apiName as string,
          displayName: (t.displayName ?? t.apiName) as string,
          properties: t.properties
            ? Object.keys(t.properties as Record<string, unknown>)
            : undefined,
        }));
        setTypes(items);
      })
      .catch(() => setTypes([]))
      .finally(() => setLoading(false));
  }, [ontologyRid]);

  return { types, loading };
}

/* ------------------------------------------------------------------ */
/*  Config Panel                                                       */
/* ------------------------------------------------------------------ */

interface ConfigPanelProps {
  widget: PlacedWidget;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: PlacedWidget) => void;
  onDelete: () => void;
}

function ConfigPanel({ widget, isOpen, onClose, onSave, onDelete }: ConfigPanelProps) {
  const [draft, setDraft] = useState<PlacedWidget>(widget);
  const { ontologies, loading: ontLoading } = useOntologies();
  const { types, loading: typesLoading } = useObjectTypes(draft.config.ontologyRid);

  // Reset draft when widget changes
  useEffect(() => {
    setDraft(widget);
  }, [widget]);

  const selectedType = types.find((t) => t.apiName === draft.config.objectType);
  const properties = selectedType?.properties ?? [];

  const updateConfig = useCallback(
    (patch: Partial<WidgetConfig>) => {
      setDraft((prev) => ({ ...prev, config: { ...prev.config, ...patch } }));
    },
    [],
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure: ${draft.title}`}
      style={{ width: 500 }}
    >
      <div style={{ padding: 20 }}>
        {/* Title */}
        <FormGroup label="Widget Title">
          <InputGroup
            value={draft.title}
            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
        </FormGroup>

        {/* Ontology */}
        <FormGroup label="Ontology">
          {ontLoading ? (
            <Spinner size={16} />
          ) : (
            <HTMLSelect
              fill
              value={draft.config.ontologyRid}
              onChange={(e) => updateConfig({ ontologyRid: e.target.value, objectType: "" })}
            >
              <option value="">Select ontology...</option>
              {ontologies.map((o) => (
                <option key={o.rid} value={o.rid}>
                  {o.displayName}
                </option>
              ))}
            </HTMLSelect>
          )}
        </FormGroup>

        {/* Object Type */}
        <FormGroup label="Object Type">
          {typesLoading ? (
            <Spinner size={16} />
          ) : (
            <HTMLSelect
              fill
              value={draft.config.objectType}
              onChange={(e) => updateConfig({ objectType: e.target.value })}
            >
              <option value="">Select object type...</option>
              {types.map((t) => (
                <option key={t.apiName} value={t.apiName}>
                  {t.displayName ?? t.apiName}
                </option>
              ))}
            </HTMLSelect>
          )}
        </FormGroup>

        {/* KPI-specific */}
        {draft.type === "kpi" && (
          <>
            <FormGroup label="Aggregation">
              <HTMLSelect
                fill
                value={draft.config.aggregationType ?? "count"}
                onChange={(e) =>
                  updateConfig({
                    aggregationType: e.target.value as WidgetConfig["aggregationType"],
                  })
                }
              >
                <option value="count">Count</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </HTMLSelect>
            </FormGroup>

            {draft.config.aggregationType !== "count" && (
              <FormGroup label="Property">
                <HTMLSelect
                  fill
                  value={draft.config.property ?? ""}
                  onChange={(e) => updateConfig({ property: e.target.value })}
                >
                  <option value="">Select property...</option>
                  {properties.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </HTMLSelect>
              </FormGroup>
            )}

            <FormGroup label="Color">
              <InputGroup
                value={draft.config.color ?? "#2965CC"}
                onChange={(e) => updateConfig({ color: e.target.value })}
                leftElement={
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      background: draft.config.color ?? "#2965CC",
                      borderRadius: 3,
                      margin: 5,
                    }}
                  />
                }
              />
            </FormGroup>
          </>
        )}

        {/* Table-specific */}
        {draft.type === "table" && (
          <>
            <FormGroup label="Columns (comma-separated, leave blank for auto)">
              <InputGroup
                value={(draft.config.columns ?? []).join(", ")}
                onChange={(e) =>
                  updateConfig({
                    columns: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="e.g. name, status, email"
              />
            </FormGroup>
            <FormGroup label="Page Size">
              <HTMLSelect
                fill
                value={String(draft.config.pageSize ?? 10)}
                onChange={(e) => updateConfig({ pageSize: Number(e.target.value) })}
              >
                {[5, 10, 20, 50].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </HTMLSelect>
            </FormGroup>
          </>
        )}

        {/* Chart-specific */}
        {draft.type === "chart" && (
          <>
            <FormGroup label="Chart Type">
              <HTMLSelect
                fill
                value={draft.config.chartType ?? "bar"}
                onChange={(e) =>
                  updateConfig({ chartType: e.target.value as WidgetConfig["chartType"] })
                }
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
              </HTMLSelect>
            </FormGroup>

            <FormGroup label="Group By">
              <HTMLSelect
                fill
                value={draft.config.groupBy ?? ""}
                onChange={(e) => updateConfig({ groupBy: e.target.value })}
              >
                <option value="">Select property...</option>
                {properties.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </HTMLSelect>
            </FormGroup>

            <FormGroup label="Aggregation">
              <HTMLSelect
                fill
                value={draft.config.aggregationType ?? "count"}
                onChange={(e) =>
                  updateConfig({
                    aggregationType: e.target.value as WidgetConfig["aggregationType"],
                  })
                }
              >
                <option value="count">Count</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </HTMLSelect>
            </FormGroup>

            {draft.config.aggregationType !== "count" && (
              <FormGroup label="Property">
                <HTMLSelect
                  fill
                  value={draft.config.property ?? ""}
                  onChange={(e) => updateConfig({ property: e.target.value })}
                >
                  <option value="">Select property...</option>
                  {properties.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </HTMLSelect>
              </FormGroup>
            )}
          </>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <Button intent="danger" minimal icon="trash" onClick={onDelete}>
            Delete Widget
          </Button>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button intent="primary" onClick={() => onSave(draft)}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Widget Renderer                                                    */
/* ------------------------------------------------------------------ */

function renderWidget(widget: PlacedWidget): React.ReactNode {
  const { type, title, config } = widget;

  if (!config.ontologyRid || !config.objectType) {
    return (
      <Card elevation={Elevation.ONE} style={{ padding: 20, textAlign: "center", color: "#8A9BA8" }}>
        <Icon icon="cog" size={24} style={{ marginBottom: 8 }} />
        <div>{title}</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>Click to configure</div>
      </Card>
    );
  }

  switch (type) {
    case "kpi":
      return (
        <KPICardWidget
          ontologyRid={config.ontologyRid}
          objectType={config.objectType}
          aggregationType={config.aggregationType ?? "count"}
          property={config.property}
          title={title}
          color={config.color}
        />
      );
    case "table":
      return (
        <DataTableWidget
          ontologyRid={config.ontologyRid}
          objectType={config.objectType}
          columns={config.columns ?? []}
          pageSize={config.pageSize}
          title={title}
        />
      );
    case "chart":
      return (
        <ChartWidget
          ontologyRid={config.ontologyRid}
          objectType={config.objectType}
          chartType={config.chartType ?? "bar"}
          groupBy={config.groupBy ?? ""}
          aggregationType={config.aggregationType ?? "count"}
          property={config.property}
          title={title}
        />
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function WorkshopEditor() {
  const [widgets, setWidgets] = useState<PlacedWidget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const selectedWidget = widgets.find((w) => w.id === selectedId) ?? null;

  /* ── Palette: add widget ─────────────────────────────────────── */
  const addWidget = useCallback((type: WidgetType) => {
    const entry = PALETTE.find((p) => p.type === type)!;
    const newWidget: PlacedWidget = {
      id: genId(),
      type,
      title: entry.label,
      config: defaultConfig(type),
    };
    setWidgets((prev) => [...prev, newWidget]);
    setSelectedId(newWidget.id);
  }, []);

  /* ── Config: update widget ───────────────────────────────────── */
  const updateWidget = useCallback((updated: PlacedWidget) => {
    setWidgets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setSelectedId(null);
  }, []);

  /* ── Config: delete widget ───────────────────────────────────── */
  const deleteWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setSelectedId(null);
  }, []);

  /* ── Persistence ─────────────────────────────────────────────── */
  const saveDashboard = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch {
      // silently fail
    }
  }, [widgets]);

  const loadDashboard = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PlacedWidget[];
        setWidgets(parsed);
      }
    } catch {
      // silently fail
    }
  }, []);

  /* ── Move widget up/down ─────────────────────────────────────── */
  const moveWidget = useCallback((id: string, direction: -1 | 1) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx < 0) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  }, []);

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Workshop Widget Builder"
        subtitle="Drag widgets from the palette, configure them, and build custom dashboards"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              icon={previewMode ? "edit" : "eye-open"}
              onClick={() => setPreviewMode((p) => !p)}
            >
              {previewMode ? "Edit" : "Preview"}
            </Button>
            <Button icon="floppy-disk" onClick={saveDashboard}>
              Save
            </Button>
            <Button icon="folder-open" onClick={loadDashboard}>
              Load
            </Button>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        {/* ── Left Sidebar: Widget Palette ─────────────────────── */}
        {!previewMode && (
          <div style={{ width: 250, flexShrink: 0 }}>
            <Card elevation={Elevation.ONE} style={{ padding: 12 }}>
              <h4 style={{ margin: "0 0 12px" }}>
                <Icon icon="widget" style={{ marginRight: 6 }} />
                Widget Palette
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PALETTE.map((item) => (
                  <Card
                    key={item.type}
                    interactive
                    elevation={Elevation.ZERO}
                    style={{
                      padding: 12,
                      cursor: "pointer",
                      border: "1px dashed #CED9E0",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                    onClick={() => addWidget(item.type)}
                  >
                    <Icon icon={item.icon} size={18} color="#5C7080" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "#8A9BA8" }}>{item.description}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── Right: Canvas Area ───────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {widgets.length === 0 ? (
            <Card elevation={Elevation.ONE} style={{ padding: 40, textAlign: "center", color: "#8A9BA8" }}>
              <Icon icon="grid-view" size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 16, marginBottom: 4 }}>No widgets yet</div>
              <div style={{ fontSize: 13 }}>
                Click a widget from the palette to add it to your dashboard
              </div>
            </Card>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 12,
              }}
            >
              {widgets.map((widget, idx) => (
                <div
                  key={widget.id}
                  style={{
                    position: "relative",
                    gridColumn: widget.type === "table" ? "1 / -1" : undefined,
                  }}
                >
                  {/* Widget controls overlay (edit mode only) */}
                  {!previewMode && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        zIndex: 10,
                        display: "flex",
                        gap: 2,
                        background: "rgba(255,255,255,0.9)",
                        borderRadius: 3,
                        padding: 2,
                      }}
                    >
                      <Button
                        minimal
                        small
                        icon="arrow-up"
                        disabled={idx === 0}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          moveWidget(widget.id, -1);
                        }}
                      />
                      <Button
                        minimal
                        small
                        icon="arrow-down"
                        disabled={idx === widgets.length - 1}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          moveWidget(widget.id, 1);
                        }}
                      />
                      <Button
                        minimal
                        small
                        icon="cog"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setSelectedId(widget.id);
                        }}
                      />
                    </div>
                  )}

                  {/* Widget click handler (edit mode) */}
                  <div
                    onClick={!previewMode ? () => setSelectedId(widget.id) : undefined}
                    style={{
                      cursor: previewMode ? "default" : "pointer",
                      border: !previewMode ? "2px solid transparent" : undefined,
                      borderColor:
                        !previewMode && selectedId === widget.id ? "#2965CC" : undefined,
                      borderRadius: 4,
                      transition: "border-color 0.15s",
                    }}
                  >
                    {renderWidget(widget)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Config Dialog ──────────────────────────────────────── */}
      {selectedWidget && (
        <ConfigPanel
          widget={selectedWidget}
          isOpen={!!selectedId}
          onClose={() => setSelectedId(null)}
          onSave={updateWidget}
          onDelete={() => deleteWidget(selectedWidget.id)}
        />
      )}
    </div>
  );
}
