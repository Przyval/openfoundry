import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Elevation,
  Icon,
  InputGroup,
  Intent,
  Spinner,
  Tag,
  Dialog,
  Callout,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WidgetKind =
  | "kpi"
  | "table"
  | "bar-chart"
  | "pie-chart"
  | "status-list"
  | "action-button"
  | "filter-bar"
  | "text";

interface WidgetDef {
  id: string;
  kind: WidgetKind;
  title: string;
  /** Grid column span (out of 12) */
  colSpan: number;
  /** Grid row span */
  rowSpan: number;
  config: Record<string, any>;
}

interface Template {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  color: string;
  widgets: WidgetDef[];
}

/* ------------------------------------------------------------------ */
/*  Palette definitions                                                */
/* ------------------------------------------------------------------ */

interface PaletteItem {
  kind: WidgetKind;
  label: string;
  icon: IconName;
  defaultColSpan: number;
  defaultRowSpan: number;
}

const PALETTE: PaletteItem[] = [
  { kind: "kpi", label: "KPI Card", icon: "dashboard", defaultColSpan: 3, defaultRowSpan: 1 },
  { kind: "table", label: "Data Table", icon: "th", defaultColSpan: 8, defaultRowSpan: 2 },
  { kind: "bar-chart", label: "Bar Chart", icon: "horizontal-bar-chart", defaultColSpan: 6, defaultRowSpan: 2 },
  { kind: "pie-chart", label: "Pie Chart", icon: "pie-chart", defaultColSpan: 4, defaultRowSpan: 2 },
  { kind: "status-list", label: "Status List", icon: "people", defaultColSpan: 4, defaultRowSpan: 2 },
  { kind: "action-button", label: "Action Button", icon: "play", defaultColSpan: 3, defaultRowSpan: 1 },
  { kind: "filter-bar", label: "Filter Bar", icon: "filter", defaultColSpan: 12, defaultRowSpan: 1 },
  { kind: "text", label: "Text / Header", icon: "font", defaultColSpan: 12, defaultRowSpan: 1 },
];

/* ------------------------------------------------------------------ */
/*  Templates                                                          */
/* ------------------------------------------------------------------ */

let _wid = 0;
function wid(): string {
  return `w-${++_wid}-${Date.now()}`;
}

const PEST_CONTROL_WIDGETS: WidgetDef[] = [
  { id: wid(), kind: "text", title: "Pest Control Operations Center", colSpan: 12, rowSpan: 1, config: { text: "Pest Control Operations Center", fontSize: "1.4rem" } },
  { id: wid(), kind: "kpi", title: "Total Customers", colSpan: 3, rowSpan: 1, config: { objectType: "Customer", aggregation: "count", icon: "people", color: "#137CBD" } },
  { id: wid(), kind: "kpi", title: "Active Jobs", colSpan: 3, rowSpan: 1, config: { objectType: "ServiceJob", aggregation: "count", filter: { status: ["scheduled", "in-progress"] }, icon: "briefcase", color: "#D9822B" } },
  { id: wid(), kind: "kpi", title: "Revenue", colSpan: 3, rowSpan: 1, config: { objectType: "ServiceJob", aggregation: "sum", property: "amountCharged", filter: { status: ["completed"] }, icon: "bank-account", color: "#0F9960", format: "currency" } },
  { id: wid(), kind: "kpi", title: "Low Stock Items", colSpan: 3, rowSpan: 1, config: { objectType: "TreatmentProduct", aggregation: "countWhere", predicate: "lowStock", icon: "warning-sign", color: "#DB3737" } },
  { id: wid(), kind: "table", title: "Today's Scheduled Jobs", colSpan: 8, rowSpan: 2, config: { objectType: "ServiceJob", columns: ["jobId", "customerName", "technicianName", "pestType", "scheduledTime", "priority", "status"] } },
  { id: wid(), kind: "status-list", title: "Technician Availability", colSpan: 4, rowSpan: 2, config: { objectType: "Technician", nameProperty: "name", statusProperty: "status", detailProperty: "specialization" } },
  { id: wid(), kind: "bar-chart", title: "Jobs by Pest Type", colSpan: 7, rowSpan: 2, config: { objectType: "ServiceJob", groupBy: "pestType", aggregation: "count" } },
  { id: wid(), kind: "action-button", title: "Schedule New Job", colSpan: 5, rowSpan: 1, config: { actionType: "schedule-job", label: "Schedule New Job", intent: "primary", icon: "plus" } },
];

const TEMPLATES: Template[] = [
  {
    id: "pest-control",
    name: "Pest Control Operations Center",
    description: "Pre-configured ops center for pest control businesses with KPIs, job scheduling, technician tracking, and inventory alerts.",
    icon: "buggy",
    color: "#0F9960",
    widgets: PEST_CONTROL_WIDGETS,
  },
  {
    id: "customer-360",
    name: "Customer 360 View",
    description: "Holistic customer view with contact details, service history, billing summary, and satisfaction metrics.",
    icon: "person",
    color: "#137CBD",
    widgets: [
      { id: wid(), kind: "text", title: "Customer 360 View", colSpan: 12, rowSpan: 1, config: { text: "Customer 360 View", fontSize: "1.4rem" } },
      { id: wid(), kind: "kpi", title: "Total Customers", colSpan: 4, rowSpan: 1, config: { objectType: "Customer", aggregation: "count", icon: "people", color: "#137CBD" } },
      { id: wid(), kind: "kpi", title: "Active Customers", colSpan: 4, rowSpan: 1, config: { objectType: "Customer", aggregation: "countWhere", predicate: "active", icon: "tick-circle", color: "#0F9960" } },
      { id: wid(), kind: "kpi", title: "Monthly Revenue", colSpan: 4, rowSpan: 1, config: { objectType: "Customer", aggregation: "sum", property: "monthlyRate", icon: "bank-account", color: "#D9822B", format: "currency" } },
      { id: wid(), kind: "table", title: "Customer Directory", colSpan: 12, rowSpan: 2, config: { objectType: "Customer", columns: ["customerId", "name", "status", "monthlyRate", "address"] } },
    ],
  },
  {
    id: "tech-performance",
    name: "Technician Performance Dashboard",
    description: "Track technician utilization, ratings, specializations, and job completion rates.",
    icon: "hat",
    color: "#634DBF",
    widgets: [
      { id: wid(), kind: "text", title: "Technician Performance", colSpan: 12, rowSpan: 1, config: { text: "Technician Performance Dashboard", fontSize: "1.4rem" } },
      { id: wid(), kind: "kpi", title: "Total Technicians", colSpan: 4, rowSpan: 1, config: { objectType: "Technician", aggregation: "count", icon: "people", color: "#634DBF" } },
      { id: wid(), kind: "kpi", title: "Available Now", colSpan: 4, rowSpan: 1, config: { objectType: "Technician", aggregation: "countWhere", predicate: "available", icon: "tick-circle", color: "#0F9960" } },
      { id: wid(), kind: "kpi", title: "On Job", colSpan: 4, rowSpan: 1, config: { objectType: "Technician", aggregation: "countWhere", predicate: "onJob", icon: "drive-time", color: "#D9822B" } },
      { id: wid(), kind: "status-list", title: "Technician Status", colSpan: 5, rowSpan: 2, config: { objectType: "Technician", nameProperty: "name", statusProperty: "status", detailProperty: "specialization" } },
      { id: wid(), kind: "bar-chart", title: "Jobs per Technician", colSpan: 7, rowSpan: 2, config: { objectType: "ServiceJob", groupBy: "technicianName", aggregation: "count" } },
    ],
  },
  {
    id: "inventory",
    name: "Inventory Management",
    description: "Monitor stock levels, reorder alerts, and product categorization across your treatment inventory.",
    icon: "box",
    color: "#D9822B",
    widgets: [
      { id: wid(), kind: "text", title: "Inventory Management", colSpan: 12, rowSpan: 1, config: { text: "Inventory Management", fontSize: "1.4rem" } },
      { id: wid(), kind: "kpi", title: "Total Products", colSpan: 3, rowSpan: 1, config: { objectType: "TreatmentProduct", aggregation: "count", icon: "box", color: "#137CBD" } },
      { id: wid(), kind: "kpi", title: "Low Stock Alerts", colSpan: 3, rowSpan: 1, config: { objectType: "TreatmentProduct", aggregation: "countWhere", predicate: "lowStock", icon: "warning-sign", color: "#DB3737" } },
      { id: wid(), kind: "kpi", title: "Categories", colSpan: 3, rowSpan: 1, config: { objectType: "TreatmentProduct", aggregation: "distinctCount", property: "category", icon: "tag", color: "#634DBF" } },
      { id: wid(), kind: "kpi", title: "Total Units", colSpan: 3, rowSpan: 1, config: { objectType: "TreatmentProduct", aggregation: "sum", property: "stockQty", icon: "cube", color: "#0F9960" } },
      { id: wid(), kind: "table", title: "Product Inventory", colSpan: 7, rowSpan: 2, config: { objectType: "TreatmentProduct", columns: ["productId", "name", "stockQty", "minStockLevel", "unit", "category"] } },
      { id: wid(), kind: "pie-chart", title: "Stock by Category", colSpan: 5, rowSpan: 2, config: { objectType: "TreatmentProduct", groupBy: "category", aggregation: "sum", property: "stockQty" } },
    ],
  },
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Start from scratch. Drag widgets from the palette to build your custom application.",
    icon: "grid-view",
    color: "#5C7080",
    widgets: [],
  },
];

/* ------------------------------------------------------------------ */
/*  Data layer                                                         */
/* ------------------------------------------------------------------ */

interface OntologyRecord {
  [key: string]: any;
}

interface OntologyDataCache {
  [objectType: string]: OntologyRecord[];
}

async function fetchAllOntologyData(): Promise<OntologyDataCache> {
  const cache: OntologyDataCache = {};
  try {
    const ontRes = await fetch(`${API_BASE_URL}/api/v2/ontologies`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!ontRes.ok) return getMockCache();
    const ontologies = await ontRes.json();
    const pestOnt = ontologies?.data?.find(
      (o: any) =>
        o.displayName?.toLowerCase().includes("pest") ||
        o.apiName?.toLowerCase().includes("pest"),
    );
    if (!pestOnt) return getMockCache();
    const rid = pestOnt.rid;
    const types = ["Customer", "Technician", "ServiceJob", "TreatmentProduct"];
    const results = await Promise.all(types.map((t) => loadObjects(rid, t)));
    types.forEach((t, i) => {
      cache[t] = results[i];
    });
    return cache;
  } catch {
    return getMockCache();
  }
}

async function loadObjects(rid: string, objectType: string): Promise<any[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/v2/ontologies/${rid}/objectSets/loadObjects`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objectSet: { type: "base", objectType }, select: [] }),
    },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.data ?? []).map((o: any) => o.properties ?? o);
}

function getMockCache(): OntologyDataCache {
  const today = new Date().toISOString().slice(0, 10);
  return {
    Customer: [
      { customerId: "C001", name: "PT Maju Sejahtera", status: "active", monthlyRate: 2500000, address: "Jl. Sudirman No. 45" },
      { customerId: "C002", name: "CV Berkah Jaya", status: "active", monthlyRate: 1800000, address: "Jl. Thamrin No. 12" },
      { customerId: "C003", name: "Toko Makmur", status: "active", monthlyRate: 950000, address: "Jl. Gatot Subroto No. 8" },
      { customerId: "C004", name: "Restaurant Padang Sederhana", status: "active", monthlyRate: 1200000, address: "Jl. Rasuna Said No. 23" },
      { customerId: "C005", name: "Hotel Grand Palace", status: "active", monthlyRate: 4500000, address: "Jl. Kuningan No. 7" },
      { customerId: "C006", name: "Gudang Sentral Logistik", status: "inactive", monthlyRate: 0, address: "Jl. Cilandak KKO" },
      { customerId: "C007", name: "RS Medika Utama", status: "active", monthlyRate: 3200000, address: "Jl. HR Rasuna Said" },
      { customerId: "C008", name: "Sekolah Nusantara", status: "active", monthlyRate: 1500000, address: "Jl. Pramuka No. 33" },
    ],
    Technician: [
      { technicianId: "T001", name: "Budi Santoso", status: "on-job", rating: 4.8, activeJobCount: 2, specialization: "Termites" },
      { technicianId: "T002", name: "Agus Prayitno", status: "available", rating: 4.5, activeJobCount: 0, specialization: "General" },
      { technicianId: "T003", name: "Deni Kurniawan", status: "on-job", rating: 4.9, activeJobCount: 1, specialization: "Rodents" },
      { technicianId: "T004", name: "Eko Wahyudi", status: "available", rating: 4.2, activeJobCount: 0, specialization: "Mosquitoes" },
      { technicianId: "T005", name: "Fajar Nugroho", status: "off-duty", rating: 4.6, activeJobCount: 0, specialization: "Cockroaches" },
      { technicianId: "T006", name: "Gilang Ramadhan", status: "on-job", rating: 4.7, activeJobCount: 1, specialization: "Termites" },
    ],
    ServiceJob: [
      { jobId: "J001", customerId: "C001", customerName: "PT Maju Sejahtera", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: today, scheduledTime: "08:00", pestType: "Termites", priority: "high", status: "in-progress", amountCharged: 3500000, customerRating: 5, followUpRequired: "no" },
      { jobId: "J002", customerId: "C004", customerName: "Restaurant Padang Sederhana", technicianId: "T003", technicianName: "Deni Kurniawan", scheduledDate: today, scheduledTime: "09:30", pestType: "Cockroaches", priority: "urgent", status: "scheduled", amountCharged: 1200000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J003", customerId: "C005", customerName: "Hotel Grand Palace", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: today, scheduledTime: "13:00", pestType: "Bedbugs", priority: "high", status: "scheduled", amountCharged: 4800000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J004", customerId: "C009", customerName: "Mall Citra Plaza", technicianId: "T006", technicianName: "Gilang Ramadhan", scheduledDate: today, scheduledTime: "10:00", pestType: "Rodents", priority: "medium", status: "in-progress", amountCharged: 2800000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J005", customerId: "C002", customerName: "CV Berkah Jaya", technicianId: "T002", technicianName: "Agus Prayitno", scheduledDate: today, scheduledTime: "14:30", pestType: "Ants", priority: "low", status: "scheduled", amountCharged: 850000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J006", customerId: "C003", customerName: "Toko Makmur", technicianId: "T004", technicianName: "Eko Wahyudi", scheduledDate: today, scheduledTime: "15:00", pestType: "Mosquitoes", priority: "medium", status: "scheduled", amountCharged: 1100000, customerRating: 0, followUpRequired: "no" },
      { jobId: "J007", customerId: "C007", customerName: "RS Medika Utama", technicianId: "T003", technicianName: "Deni Kurniawan", scheduledDate: "2026-03-02", pestType: "Termites", priority: "high", status: "completed", amountCharged: 5200000, customerRating: 5, followUpRequired: "yes" },
      { jobId: "J008", customerId: "C008", customerName: "Sekolah Nusantara", technicianId: "T005", technicianName: "Fajar Nugroho", scheduledDate: "2026-03-03", pestType: "Cockroaches", priority: "medium", status: "completed", amountCharged: 1600000, customerRating: 4, followUpRequired: "yes" },
      { jobId: "J009", customerId: "C001", customerName: "PT Maju Sejahtera", technicianId: "T001", technicianName: "Budi Santoso", scheduledDate: "2026-03-05", pestType: "Rodents", priority: "high", status: "completed", amountCharged: 3800000, customerRating: 5, followUpRequired: "no" },
      { jobId: "J010", customerId: "C005", customerName: "Hotel Grand Palace", technicianId: "T006", technicianName: "Gilang Ramadhan", scheduledDate: "2026-03-06", pestType: "Bedbugs", priority: "urgent", status: "completed", amountCharged: 6200000, customerRating: 5, followUpRequired: "yes" },
    ],
    TreatmentProduct: [
      { productId: "P001", name: "Termidor SC", stockQty: 12, minStockLevel: 10, unit: "liters", category: "Termiticide" },
      { productId: "P002", name: "Demand CS", stockQty: 5, minStockLevel: 8, unit: "liters", category: "Insecticide" },
      { productId: "P003", name: "Contrac Blox", stockQty: 18, minStockLevel: 15, unit: "kg", category: "Rodenticide" },
      { productId: "P004", name: "Advion Gel", stockQty: 3, minStockLevel: 10, unit: "tubes", category: "Gel Bait" },
      { productId: "P005", name: "Temprid FX", stockQty: 8, minStockLevel: 6, unit: "liters", category: "Insecticide" },
      { productId: "P006", name: "Suspend Polyzone", stockQty: 2, minStockLevel: 5, unit: "liters", category: "Insecticide" },
      { productId: "P007", name: "Dragnet SFR", stockQty: 15, minStockLevel: 8, unit: "liters", category: "Insecticide" },
      { productId: "P008", name: "Gentrol IGR", stockQty: 6, minStockLevel: 10, unit: "units", category: "Growth Regulator" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Aggregation helpers                                                */
/* ------------------------------------------------------------------ */

const CHART_COLORS = ["#137CBD", "#0F9960", "#D9822B", "#DB3737", "#634DBF", "#96620E", "#1F4B99", "#A82A2A", "#29A634", "#BF7326"];

function computeKpi(data: OntologyDataCache, config: Record<string, any>): string {
  const rows = data[config.objectType] ?? [];
  const { aggregation, property, filter, predicate, format } = config;

  let filtered = rows;
  if (filter?.status) {
    const statuses = filter.status.map((s: string) => s.toLowerCase());
    filtered = rows.filter((r) => statuses.includes((r.status ?? "").toLowerCase()));
  }

  let value: number;
  switch (aggregation) {
    case "count":
      value = filtered.length;
      break;
    case "sum":
      value = filtered.reduce((s, r) => s + (Number(r[property]) || 0), 0);
      break;
    case "countWhere":
      if (predicate === "lowStock") {
        value = rows.filter((r) => r.stockQty < r.minStockLevel).length;
      } else if (predicate === "active") {
        value = rows.filter((r) => (r.status ?? "").toLowerCase() === "active").length;
      } else if (predicate === "available") {
        value = rows.filter((r) => (r.status ?? "").toLowerCase() === "available").length;
      } else if (predicate === "onJob") {
        value = rows.filter((r) => ["on-job", "on_job"].includes((r.status ?? "").toLowerCase())).length;
      } else {
        value = filtered.length;
      }
      break;
    case "distinctCount":
      value = new Set(rows.map((r) => r[property]).filter(Boolean)).size;
      break;
    default:
      value = filtered.length;
  }

  if (format === "currency") {
    return "Rp " + value.toLocaleString("id-ID");
  }
  return value.toLocaleString();
}

function computeBarChart(data: OntologyDataCache, config: Record<string, any>): { label: string; value: number; color: string }[] {
  const rows = data[config.objectType] ?? [];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[config.groupBy] ?? "Unknown");
    if (config.aggregation === "sum" && config.property) {
      counts[key] = (counts[key] ?? 0) + (Number(row[config.property]) || 0);
    } else {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
}

function computePieChart(data: OntologyDataCache, config: Record<string, any>): { label: string; value: number; color: string; pct: number }[] {
  const bars = computeBarChart(data, config);
  const total = bars.reduce((s, b) => s + b.value, 0) || 1;
  return bars.map((b) => ({ ...b, pct: (b.value / total) * 100 }));
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S = {
  layout: {
    display: "flex",
    height: "calc(100vh - 130px)",
    gap: 0,
    margin: "0 -20px -20px -20px",
  } as React.CSSProperties,
  palette: {
    width: 220,
    minWidth: 220,
    borderRight: "1px solid #E1E8ED",
    background: "#F6F7F9",
    overflowY: "auto",
    padding: "12px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } as React.CSSProperties,
  paletteItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    cursor: "grab",
    background: "#fff",
    border: "1px solid #E1E8ED",
    fontSize: "0.85rem",
    fontWeight: 500,
    transition: "box-shadow 0.15s, border-color 0.15s",
  } as React.CSSProperties,
  canvas: {
    flex: 1,
    overflowY: "auto",
    padding: 20,
    background: "#EBEEF2",
    position: "relative",
  } as React.CSSProperties,
  canvasGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: 14,
    minHeight: "100%",
    alignContent: "start",
  } as React.CSSProperties,
  configPanel: {
    width: 280,
    minWidth: 280,
    borderLeft: "1px solid #E1E8ED",
    background: "#F6F7F9",
    overflowY: "auto",
    padding: "16px 14px",
  } as React.CSSProperties,
  widgetCard: (selected: boolean) => ({
    borderRadius: 8,
    padding: 14,
    cursor: "pointer",
    outline: selected ? "2px solid #137CBD" : "none",
    outlineOffset: selected ? -2 : 0,
    transition: "outline 0.15s, box-shadow 0.15s",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }) as React.CSSProperties,
  widgetTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#5C7080",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 6,
  } as React.CSSProperties,
  kpiValue: {
    fontSize: "1.8rem",
    fontWeight: 700,
    lineHeight: 1.2,
    margin: "4px 0",
  } as React.CSSProperties,
  kpiAccent: (color: string) => ({
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: color,
    borderRadius: "8px 8px 0 0",
  }) as React.CSSProperties,
  templateCard: (color: string) => ({
    cursor: "pointer",
    borderRadius: 10,
    padding: "20px 18px",
    borderLeft: `4px solid ${color}`,
    transition: "box-shadow 0.2s, transform 0.15s",
    position: "relative",
  }) as React.CSSProperties,
  statusDot: (color: string) => ({
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  }) as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  Status color helper                                                */
/* ------------------------------------------------------------------ */

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "available": return "#0F9960";
    case "on-job": case "on_job": return "#D9822B";
    case "off-duty": case "off_duty": return "#8A9BA8";
    case "active": return "#0F9960";
    case "inactive": return "#8A9BA8";
    case "completed": return "#0F9960";
    case "in-progress": case "in_progress": return "#137CBD";
    case "scheduled": return "#D9822B";
    default: return "#5C7080";
  }
}

function priorityIntent(p: string): Intent {
  switch (p.toLowerCase()) {
    case "high": case "urgent": return Intent.DANGER;
    case "medium": return Intent.WARNING;
    case "low": return Intent.SUCCESS;
    default: return Intent.NONE;
  }
}

/* ------------------------------------------------------------------ */
/*  Widget renderers                                                   */
/* ------------------------------------------------------------------ */

function RenderKpi({ widget, data }: { widget: WidgetDef; data: OntologyDataCache }) {
  const value = computeKpi(data, widget.config);
  const { icon, color } = widget.config;
  return (
    <div style={{ position: "relative", textAlign: "center", padding: "6px 0" }}>
      <div style={S.kpiAccent(color ?? "#137CBD")} />
      <Icon icon={(icon ?? "dashboard") as IconName} size={22} style={{ color: color ?? "#137CBD", marginBottom: 4 }} />
      <div style={S.kpiValue}>{value}</div>
      <div style={{ fontSize: "0.8rem", color: "#5C7080", fontWeight: 500 }}>{widget.title}</div>
    </div>
  );
}

function RenderTable({ widget, data }: { widget: WidgetDef; data: OntologyDataCache }) {
  const rows = data[widget.config.objectType] ?? [];
  const columns: string[] = widget.config.columns ?? Object.keys(rows[0] ?? {}).slice(0, 6);
  const displayRows = rows.slice(0, 12);

  return (
    <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #E1E8ED", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", color: "#5C7080", whiteSpace: "nowrap" }}>
                {col.replace(/([A-Z])/g, " $1").trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: "1px solid #F0F0F0" }}>
              {columns.map((col) => {
                const val = row[col];
                if (col === "status") {
                  return <td key={col} style={{ padding: "5px 8px" }}><Tag minimal round intent={val === "completed" ? Intent.SUCCESS : val === "in-progress" ? Intent.PRIMARY : val === "scheduled" ? Intent.WARNING : Intent.NONE} style={{ fontSize: "0.75rem" }}>{String(val)}</Tag></td>;
                }
                if (col === "priority") {
                  return <td key={col} style={{ padding: "5px 8px" }}><Tag minimal round intent={priorityIntent(String(val ?? ""))} style={{ fontSize: "0.75rem" }}>{String(val)}</Tag></td>;
                }
                if (col === "amountCharged" || col === "monthlyRate") {
                  return <td key={col} style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>Rp {Number(val).toLocaleString("id-ID")}</td>;
                }
                return <td key={col} style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{val != null ? String(val) : "-"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 12 && <div style={{ fontSize: "0.75rem", color: "#8A9BA8", textAlign: "center", padding: 6 }}>Showing 12 of {rows.length} rows</div>}
    </div>
  );
}

function RenderBarChart({ widget, data }: { widget: WidgetDef; data: OntologyDataCache }) {
  const bars = computeBarChart(data, widget.config);
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
      {bars.map((bar) => (
        <div key={bar.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 90, fontSize: "0.82rem", fontWeight: 500, textAlign: "right", whiteSpace: "nowrap" }}>{bar.label}</div>
          <div style={{ flex: 1, background: "#E8ECF0", borderRadius: 4, height: 22, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 4, background: bar.color, width: `${(bar.value / maxVal) * 100}%`, transition: "width 0.5s ease", minWidth: 2 }} />
          </div>
          <div style={{ minWidth: 32, fontSize: "0.8rem", fontWeight: 600 }}>{bar.value}</div>
        </div>
      ))}
    </div>
  );
}

function RenderPieChart({ widget, data }: { widget: WidgetDef; data: OntologyDataCache }) {
  const slices = computePieChart(data, widget.config);
  let cumulativePct = 0;
  const gradientParts: string[] = [];
  for (const slice of slices) {
    gradientParts.push(`${slice.color} ${cumulativePct}% ${cumulativePct + slice.pct}%`);
    cumulativePct += slice.pct;
  }
  const gradient = `conic-gradient(${gradientParts.join(", ")})`;

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 20, justifyContent: "center" }}>
      <div style={{ width: 120, height: 120, borderRadius: "50%", background: gradient, flexShrink: 0, boxShadow: "inset 0 0 0 24px #fff" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span>{s.label}</span>
            <span style={{ color: "#8A9BA8", marginLeft: 4 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RenderStatusList({ widget, data }: { widget: WidgetDef; data: OntologyDataCache }) {
  const rows = data[widget.config.objectType] ?? [];
  const { nameProperty, statusProperty, detailProperty } = widget.config;
  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      {rows.map((row, i) => {
        const name = row[nameProperty] ?? `Item ${i + 1}`;
        const status = row[statusProperty] ?? "";
        const detail = detailProperty ? row[detailProperty] : null;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid #F0F0F0" }}>
            <div style={S.statusDot(statusColor(status))} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{name}</div>
              {detail && <div style={{ fontSize: "0.75rem", color: "#8A9BA8" }}>{detail}</div>}
            </div>
            <Tag minimal round style={{ fontSize: "0.7rem" }}>{status}</Tag>
          </div>
        );
      })}
    </div>
  );
}

function RenderActionButton({ widget }: { widget: WidgetDef }) {
  const [clicked, setClicked] = useState(false);
  const { label, intent, icon } = widget.config;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
      <Button
        large
        intent={(intent ?? "primary") as Intent}
        icon={(icon ?? "play") as IconName}
        text={clicked ? "Action triggered!" : label ?? widget.title}
        onClick={() => { setClicked(true); setTimeout(() => setClicked(false), 2000); }}
        style={{ minWidth: 180 }}
      />
    </div>
  );
}

function RenderFilterBar({ widget }: { widget: WidgetDef }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Icon icon="filter" size={14} style={{ color: "#5C7080" }} />
      <InputGroup leftIcon="search" placeholder="Search..." style={{ width: 200 }} small />
      <div className="bp5-html-select" style={{ fontSize: "0.85rem" }}>
        <select><option>All Statuses</option><option>Active</option><option>Completed</option></select>
        <span className="bp5-icon bp5-icon-double-caret-vertical" />
      </div>
      <div className="bp5-html-select" style={{ fontSize: "0.85rem" }}>
        <select><option>All Types</option><option>High Priority</option><option>Medium</option><option>Low</option></select>
        <span className="bp5-icon bp5-icon-double-caret-vertical" />
      </div>
      <Button small minimal icon="cross" text="Clear" />
    </div>
  );
}

function RenderText({ widget }: { widget: WidgetDef }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Icon icon="applications" size={20} style={{ color: "#137CBD" }} />
      <span style={{ fontSize: widget.config.fontSize ?? "1rem", fontWeight: 600 }}>{widget.config.text ?? widget.title}</span>
      <Tag minimal round intent={Intent.SUCCESS} style={{ fontSize: "0.7rem" }}>LIVE</Tag>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Widget wrapper                                                     */
/* ------------------------------------------------------------------ */

function WidgetRenderer({ widget, data, selected, onSelect, onRemove }: {
  widget: WidgetDef;
  data: OntologyDataCache;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const renderContent = () => {
    switch (widget.kind) {
      case "kpi": return <RenderKpi widget={widget} data={data} />;
      case "table": return <RenderTable widget={widget} data={data} />;
      case "bar-chart": return <RenderBarChart widget={widget} data={data} />;
      case "pie-chart": return <RenderPieChart widget={widget} data={data} />;
      case "status-list": return <RenderStatusList widget={widget} data={data} />;
      case "action-button": return <RenderActionButton widget={widget} />;
      case "filter-bar": return <RenderFilterBar widget={widget} />;
      case "text": return <RenderText widget={widget} />;
      default: return <div>Unknown widget type</div>;
    }
  };

  return (
    <div style={{ gridColumn: `span ${widget.colSpan}` }} onClick={onSelect}>
      <Card elevation={Elevation.TWO} style={S.widgetCard(selected)}>
        {widget.kind !== "text" && widget.kind !== "filter-bar" && (
          <div style={S.widgetTitle}>
            <span>{widget.title}</span>
            <div style={{ flex: 1 }} />
            <Button minimal icon="cross" intent={Intent.DANGER} style={{ minHeight: 18, minWidth: 18, padding: 0 }} onClick={(e) => { e.stopPropagation(); onRemove(); }} />
          </div>
        )}
        {(widget.kind === "text" || widget.kind === "filter-bar") && (
          <div style={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}>
            <Button minimal icon="cross" intent={Intent.DANGER} style={{ minHeight: 18, minWidth: 18, padding: 0, opacity: 0.5 }} onClick={(e) => { e.stopPropagation(); onRemove(); }} />
          </div>
        )}
        {renderContent()}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Config Panel                                                       */
/* ------------------------------------------------------------------ */

function ConfigPanel({ widget, onChange }: { widget: WidgetDef | null; onChange: (updated: WidgetDef) => void }) {
  if (!widget) {
    return (
      <div style={S.configPanel}>
        <div style={{ textAlign: "center", color: "#8A9BA8", marginTop: 60 }}>
          <Icon icon="widget" size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: "0.9rem", fontWeight: 500 }}>No widget selected</div>
          <div style={{ fontSize: "0.8rem", marginTop: 4 }}>Click a widget on the canvas to configure it</div>
        </div>
      </div>
    );
  }

  const objectTypes = ["Customer", "Technician", "ServiceJob", "TreatmentProduct"];

  return (
    <div style={S.configPanel}>
      <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon icon="cog" size={14} />
        Widget Configuration
      </div>

      <label style={labelStyle}>Title</label>
      <InputGroup
        small
        fill
        value={widget.title}
        onChange={(e) => onChange({ ...widget, title: e.target.value })}
        style={{ marginBottom: 10 }}
      />

      <label style={labelStyle}>Widget Type</label>
      <div style={{ marginBottom: 10 }}>
        <Tag intent={Intent.PRIMARY} round>{widget.kind}</Tag>
      </div>

      <label style={labelStyle}>Column Span (1-12)</label>
      <div className="bp5-html-select bp5-fill" style={{ marginBottom: 10 }}>
        <select value={widget.colSpan} onChange={(e) => onChange({ ...widget, colSpan: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
            <option key={n} value={n}>{n} / 12</option>
          ))}
        </select>
        <span className="bp5-icon bp5-icon-double-caret-vertical" />
      </div>

      {(widget.kind === "kpi" || widget.kind === "table" || widget.kind === "bar-chart" || widget.kind === "pie-chart" || widget.kind === "status-list") && (
        <>
          <label style={labelStyle}>Data Source (Object Type)</label>
          <div className="bp5-html-select bp5-fill" style={{ marginBottom: 10 }}>
            <select value={widget.config.objectType ?? ""} onChange={(e) => onChange({ ...widget, config: { ...widget.config, objectType: e.target.value } })}>
              <option value="">Select...</option>
              {objectTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="bp5-icon bp5-icon-double-caret-vertical" />
          </div>
        </>
      )}

      {(widget.kind === "bar-chart" || widget.kind === "pie-chart") && (
        <>
          <label style={labelStyle}>Group By Property</label>
          <InputGroup
            small
            fill
            value={widget.config.groupBy ?? ""}
            onChange={(e) => onChange({ ...widget, config: { ...widget.config, groupBy: e.target.value } })}
            placeholder="e.g. pestType"
            style={{ marginBottom: 10 }}
          />
        </>
      )}

      {widget.kind === "kpi" && (
        <>
          <label style={labelStyle}>Aggregation</label>
          <div className="bp5-html-select bp5-fill" style={{ marginBottom: 10 }}>
            <select value={widget.config.aggregation ?? "count"} onChange={(e) => onChange({ ...widget, config: { ...widget.config, aggregation: e.target.value } })}>
              <option value="count">Count</option>
              <option value="sum">Sum</option>
              <option value="countWhere">Count Where</option>
              <option value="distinctCount">Distinct Count</option>
            </select>
            <span className="bp5-icon bp5-icon-double-caret-vertical" />
          </div>

          <label style={labelStyle}>Accent Color</label>
          <InputGroup
            small
            fill
            value={widget.config.color ?? "#137CBD"}
            onChange={(e) => onChange({ ...widget, config: { ...widget.config, color: e.target.value } })}
            placeholder="#137CBD"
            style={{ marginBottom: 10 }}
          />
        </>
      )}

      {widget.kind === "text" && (
        <>
          <label style={labelStyle}>Display Text</label>
          <InputGroup
            small
            fill
            value={widget.config.text ?? ""}
            onChange={(e) => onChange({ ...widget, config: { ...widget.config, text: e.target.value } })}
            style={{ marginBottom: 10 }}
          />
          <label style={labelStyle}>Font Size</label>
          <InputGroup
            small
            fill
            value={widget.config.fontSize ?? "1rem"}
            onChange={(e) => onChange({ ...widget, config: { ...widget.config, fontSize: e.target.value } })}
            style={{ marginBottom: 10 }}
          />
        </>
      )}

      <div style={{ marginTop: 16, padding: "10px 0", borderTop: "1px solid #E1E8ED" }}>
        <Callout icon="info-sign" intent={Intent.PRIMARY} style={{ fontSize: "0.8rem" }}>
          Changes apply instantly. Widget data refreshes from the connected Ontology API.
        </Callout>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#5C7080",
  marginBottom: 4,
};

/* ------------------------------------------------------------------ */
/*  Template Gallery                                                   */
/* ------------------------------------------------------------------ */

function TemplateGallery({ onSelect }: { onSelect: (t: Template) => void }) {
  return (
    <div style={{ padding: "40px 20px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <Icon icon="applications" size={44} style={{ color: "#137CBD", marginBottom: 12 }} />
        <h2 style={{ margin: "0 0 8px", fontSize: "1.6rem", fontWeight: 700 }}>Workshop App Builder</h2>
        <p style={{ color: "#5C7080", fontSize: "0.95rem", margin: 0, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          Build powerful operational applications on top of the Ontology — no coding required. Select a template to get started, or begin with a blank canvas.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260, 1fr))", gap: 16 }}>
        {TEMPLATES.map((t) => (
          <Card
            key={t.id}
            elevation={Elevation.TWO}
            interactive
            style={S.templateCard(t.color) as any}
            onClick={() => onSelect(t)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${t.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon={t.icon} size={20} style={{ color: t.color }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{t.name}</div>
            </div>
            <div style={{ fontSize: "0.82rem", color: "#5C7080", lineHeight: 1.5 }}>{t.description}</div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Tag minimal round style={{ fontSize: "0.7rem" }}>{t.widgets.length} widgets</Tag>
              {t.id === "pest-control" && <Tag intent={Intent.SUCCESS} minimal round style={{ fontSize: "0.7rem" }}>Recommended</Tag>}
              {t.id === "blank" && <Tag intent={Intent.NONE} minimal round style={{ fontSize: "0.7rem" }}>Start fresh</Tag>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function Workshop() {
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [widgets, setWidgets] = useState<WidgetDef[]>([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [data, setData] = useState<OntologyDataCache>({});
  const [loading, setLoading] = useState(false);
  const [showBackDialog, setShowBackDialog] = useState(false);

  /* Fetch data when a template is selected */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchAllOntologyData();
      setData(result);
    } catch {
      setData(getMockCache());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTemplate) {
      void loadData();
    }
  }, [activeTemplate, loadData]);

  const handleSelectTemplate = useCallback((t: Template) => {
    setActiveTemplate(t);
    setWidgets(t.widgets.map((w) => ({ ...w, id: wid() })));
    setSelectedWidgetId(null);
  }, []);

  const handleBackToGallery = useCallback(() => {
    if (widgets.length > 0) {
      setShowBackDialog(true);
    } else {
      setActiveTemplate(null);
      setWidgets([]);
      setSelectedWidgetId(null);
    }
  }, [widgets.length]);

  const confirmBack = useCallback(() => {
    setShowBackDialog(false);
    setActiveTemplate(null);
    setWidgets([]);
    setSelectedWidgetId(null);
  }, []);

  const handleAddWidget = useCallback((palette: PaletteItem) => {
    const newWidget: WidgetDef = {
      id: wid(),
      kind: palette.kind,
      title: palette.label,
      colSpan: palette.defaultColSpan,
      rowSpan: palette.defaultRowSpan,
      config: palette.kind === "kpi"
        ? { objectType: "Customer", aggregation: "count", icon: "dashboard", color: "#137CBD" }
        : palette.kind === "table"
        ? { objectType: "Customer", columns: ["customerId", "name", "status"] }
        : palette.kind === "bar-chart"
        ? { objectType: "ServiceJob", groupBy: "pestType", aggregation: "count" }
        : palette.kind === "pie-chart"
        ? { objectType: "TreatmentProduct", groupBy: "category", aggregation: "count" }
        : palette.kind === "status-list"
        ? { objectType: "Technician", nameProperty: "name", statusProperty: "status", detailProperty: "specialization" }
        : palette.kind === "text"
        ? { text: "New Section", fontSize: "1.2rem" }
        : {},
    };
    setWidgets((prev) => [...prev, newWidget]);
    setSelectedWidgetId(newWidget.id);
  }, []);

  const handleRemoveWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setSelectedWidgetId((prev) => (prev === id ? null : prev));
  }, []);

  const handleUpdateWidget = useCallback((updated: WidgetDef) => {
    setWidgets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  }, []);

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedWidgetId) ?? null,
    [widgets, selectedWidgetId],
  );

  /* ---- Gallery view ---- */
  if (!activeTemplate) {
    return (
      <>
        <PageHeader
          title="Workshop"
          actions={<Tag intent={Intent.PRIMARY} large round icon="applications">App Builder</Tag>}
        />
        <TemplateGallery onSelect={handleSelectTemplate} />
      </>
    );
  }

  /* ---- Builder view ---- */
  return (
    <>
      <PageHeader
        title="Workshop"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button icon="arrow-left" minimal onClick={handleBackToGallery}>Templates</Button>
            <Tag intent={Intent.PRIMARY} round>{activeTemplate.name}</Tag>
            <Button icon="refresh" minimal onClick={loadData} loading={loading}>Refresh Data</Button>
            <Tag minimal round intent={Intent.SUCCESS} icon="dot" style={{ fontSize: "0.75rem" }}>
              {Object.values(data).reduce((s, arr) => s + arr.length, 0)} objects loaded
            </Tag>
          </div>
        }
      />

      <Dialog isOpen={showBackDialog} onClose={() => setShowBackDialog(false)} title="Return to Templates?" icon="warning-sign">
        <div style={{ padding: 20 }}>
          <p>Your current layout will be lost. Are you sure you want to go back to the template gallery?</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <Button onClick={() => setShowBackDialog(false)}>Cancel</Button>
            <Button intent={Intent.DANGER} onClick={confirmBack}>Discard & Go Back</Button>
          </div>
        </div>
      </Dialog>

      <div style={S.layout}>
        {/* Left — Widget Palette */}
        <div style={S.palette as any}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#5C7080", marginBottom: 4, paddingLeft: 4 }}>
            Widget Palette
          </div>
          {PALETTE.map((p) => (
            <div
              key={p.kind}
              style={S.paletteItem}
              onClick={() => handleAddWidget(p)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#137CBD";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(19,124,189,0.25)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#E1E8ED";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
              title={`Add ${p.label} widget`}
            >
              <Icon icon={p.icon} size={16} style={{ color: "#137CBD" }} />
              <span>{p.label}</span>
            </div>
          ))}
          <div style={{ marginTop: "auto", padding: "12px 4px 4px", borderTop: "1px solid #E1E8ED", fontSize: "0.72rem", color: "#8A9BA8", lineHeight: 1.5 }}>
            Click a widget to add it to the canvas. Select widgets on the canvas to configure them.
          </div>
        </div>

        {/* Center — Canvas */}
        <div style={S.canvas as any}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <Spinner size={50} />
            </div>
          ) : widgets.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#8A9BA8" }}>
              <Icon icon="widget" size={60} style={{ opacity: 0.2, marginBottom: 16 }} />
              <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>Empty Canvas</div>
              <div style={{ fontSize: "0.9rem", marginTop: 6 }}>Add widgets from the palette on the left</div>
            </div>
          ) : (
            <div style={S.canvasGrid}>
              {widgets.map((w) => (
                <WidgetRenderer
                  key={w.id}
                  widget={w}
                  data={data}
                  selected={w.id === selectedWidgetId}
                  onSelect={() => setSelectedWidgetId(w.id)}
                  onRemove={() => handleRemoveWidget(w.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right — Config Panel */}
        <ConfigPanel widget={selectedWidget} onChange={handleUpdateWidget} />
      </div>
    </>
  );
}
