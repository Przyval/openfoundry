import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Colors,
  Elevation,
  HTMLSelect,
  HTMLTable,
  Icon,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type BoardType = "table" | "groupby" | "aggregate" | "chart" | "filter";
type ChartMode = "bar" | "pie";
type AggFunc = "count" | "sum" | "avg";

interface Board {
  id: string;
  type: BoardType;
  config: Record<string, any>;
}

interface OntologyMeta {
  rid: string;
  apiName: string;
  displayName: string;
}

interface AggBucket {
  group: Record<string, any>;
  metrics: { name: string; value: number }[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OBJECT_TYPES = [
  "ServiceJob",
  "Customer",
  "Technician",
  "TreatmentProduct",
  "Invoice",
  "Vehicle",
  "Schedule",
];

const BOARD_META: Record<
  BoardType,
  { label: string; icon: IconName; color: string }
> = {
  table: { label: "Table", icon: "th", color: Colors.BLUE3 },
  filter: { label: "Filter", icon: "filter", color: Colors.ORANGE3 },
  groupby: { label: "Group By", icon: "group-objects", color: Colors.GREEN3 },
  aggregate: { label: "Aggregate", icon: "calculator", color: Colors.VIOLET3 },
  chart: { label: "Chart", icon: "chart", color: Colors.RED3 },
};

const PALETTE = [
  "#2965CC", "#29A634", "#D99E0B", "#D13913", "#8F398F",
  "#00B3A4", "#DB2C6F", "#9BBF30", "#96622D", "#7157D9",
  "#634DBF", "#1F4B99", "#0A6640", "#A82A2A", "#BF7326",
  "#5C7080",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let boardCounter = 0;
function nextBoardId(): string {
  boardCounter += 1;
  return `board-${boardCounter}`;
}

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function isNumeric(v: unknown): boolean {
  return typeof v === "number" && !Number.isNaN(v);
}

function inferProperties(rows: Record<string, any>[]): string[] {
  if (rows.length === 0) return [];
  const keys = new Set<string>();
  for (const r of rows.slice(0, 20)) {
    for (const k of Object.keys(r)) keys.add(k);
  }
  return Array.from(keys).sort();
}

function inferNumericProperties(rows: Record<string, any>[]): string[] {
  return inferProperties(rows).filter((k) =>
    rows.slice(0, 20).some((r) => isNumeric(r[k])),
  );
}

function inferStringProperties(rows: Record<string, any>[]): string[] {
  return inferProperties(rows).filter((k) =>
    rows.slice(0, 20).some(
      (r) => typeof r[k] === "string" && r[k] !== "",
    ),
  );
}

function prettyHeader(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCell(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "number") {
    if (val > 10000) return formatRupiah(val);
    return val.toLocaleString("id-ID");
  }
  return String(val);
}

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function fetchOntologies(): Promise<OntologyMeta[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v2/ontologies`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return (body?.data ?? []).map((o: any) => ({
      rid: o.rid,
      apiName: o.apiName ?? o.rid,
      displayName: o.displayName ?? o.apiName ?? o.rid,
    }));
  } catch {
    return [];
  }
}

async function loadObjects(
  ontologyRid: string,
  objectType: string,
): Promise<Record<string, any>[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/loadObjects`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          objectSet: { type: "base", objectType },
          select: [],
          pageSize: 200,
        }),
      },
    );
    if (!res.ok) return [];
    const body = await res.json();
    return (body?.data ?? []).map((o: any) => o.properties ?? o);
  } catch {
    return [];
  }
}

async function aggregateObjects(
  ontologyRid: string,
  objectType: string,
  groupByField: string,
): Promise<AggBucket[]> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/v2/ontologies/${ontologyRid}/objectSets/aggregate`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          objectSet: { type: "base", objectType },
          groupBy: [{ field: groupByField, type: "exact" }],
          aggregation: [{ type: "count" }],
        }),
      },
    );
    if (!res.ok) return [];
    const body = await res.json();
    return body?.data ?? [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

function getMockServiceJobs(): Record<string, any>[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    { jobId: "J001", customerName: "PT Maju Sejahtera", technicianName: "Budi Santoso", scheduledDate: today, pestType: "Termites", priority: "high", status: "in-progress", amountCharged: 3500000, customerRating: 5, followUpRequired: "no" },
    { jobId: "J002", customerName: "Restaurant Padang Sederhana", technicianName: "Deni Kurniawan", scheduledDate: today, pestType: "Cockroaches", priority: "urgent", status: "scheduled", amountCharged: 1200000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J003", customerName: "Hotel Grand Palace", technicianName: "Budi Santoso", scheduledDate: today, pestType: "Bedbugs", priority: "high", status: "scheduled", amountCharged: 4800000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J004", customerName: "Mall Citra Plaza", technicianName: "Gilang Ramadhan", scheduledDate: today, pestType: "Rodents", priority: "medium", status: "in-progress", amountCharged: 2800000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J005", customerName: "CV Berkah Jaya", technicianName: "Agus Prayitno", scheduledDate: today, pestType: "Ants", priority: "low", status: "scheduled", amountCharged: 850000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J006", customerName: "Toko Makmur", technicianName: "Eko Wahyudi", scheduledDate: today, pestType: "Mosquitoes", priority: "medium", status: "scheduled", amountCharged: 1100000, customerRating: 0, followUpRequired: "no" },
    { jobId: "J007", customerName: "RS Medika Utama", technicianName: "Deni Kurniawan", scheduledDate: "2026-03-02", pestType: "Termites", priority: "high", status: "completed", amountCharged: 5200000, customerRating: 5, followUpRequired: "yes" },
    { jobId: "J008", customerName: "Sekolah Nusantara", technicianName: "Fajar Nugroho", scheduledDate: "2026-03-03", pestType: "Cockroaches", priority: "medium", status: "completed", amountCharged: 1600000, customerRating: 4, followUpRequired: "yes" },
    { jobId: "J009", customerName: "PT Maju Sejahtera", technicianName: "Budi Santoso", scheduledDate: "2026-03-05", pestType: "Rodents", priority: "high", status: "completed", amountCharged: 3800000, customerRating: 5, followUpRequired: "no" },
    { jobId: "J010", customerName: "Hotel Grand Palace", technicianName: "Gilang Ramadhan", scheduledDate: "2026-03-06", pestType: "Bedbugs", priority: "urgent", status: "completed", amountCharged: 6200000, customerRating: 5, followUpRequired: "yes" },
    { jobId: "J011", customerName: "Mall Citra Plaza", technicianName: "Agus Prayitno", scheduledDate: "2026-03-08", pestType: "Flies", priority: "low", status: "completed", amountCharged: 950000, customerRating: 4, followUpRequired: "no" },
    { jobId: "J012", customerName: "Restaurant Padang Sederhana", technicianName: "Eko Wahyudi", scheduledDate: "2026-03-09", pestType: "Cockroaches", priority: "high", status: "completed", amountCharged: 1450000, customerRating: 5, followUpRequired: "no" },
    { jobId: "J013", customerName: "CV Berkah Jaya", technicianName: "Deni Kurniawan", scheduledDate: "2026-03-10", pestType: "Termites", priority: "medium", status: "completed", amountCharged: 2900000, customerRating: 4, followUpRequired: "no" },
    { jobId: "J014", customerName: "RS Medika Utama", technicianName: "Budi Santoso", scheduledDate: "2026-03-11", pestType: "Ants", priority: "low", status: "completed", amountCharged: 1100000, customerRating: 5, followUpRequired: "no" },
    { jobId: "J015", customerName: "Hotel Grand Palace", technicianName: "Fajar Nugroho", scheduledDate: "2026-03-12", pestType: "Mosquitoes", priority: "medium", status: "cancelled", amountCharged: 0, customerRating: 0, followUpRequired: "no" },
    { jobId: "J016", customerName: "Toko Makmur", technicianName: "Agus Prayitno", scheduledDate: "2026-03-13", pestType: "Ants", priority: "low", status: "cancelled", amountCharged: 0, customerRating: 0, followUpRequired: "no" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const S = {
  page: { padding: 0, maxWidth: 1100, margin: "0 auto" } as React.CSSProperties,
  topBar: {
    display: "flex", alignItems: "center", gap: 16, padding: "12px 16px",
    background: Colors.DARK_GRAY5, borderRadius: 6, marginBottom: 20, flexWrap: "wrap" as const,
  } as React.CSSProperties,
  topLabel: { fontWeight: 600, fontSize: "0.85rem", color: Colors.GRAY4 } as React.CSSProperties,
  pipeline: { display: "flex", flexDirection: "column" as const, gap: 0 } as React.CSSProperties,
  connector: {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: 36, position: "relative" as const,
  } as React.CSSProperties,
  connectorLine: {
    width: 2, height: "100%", background: Colors.GRAY3,
    position: "absolute" as const, left: "50%", transform: "translateX(-50%)",
  } as React.CSSProperties,
  addBtn: { position: "relative" as const, zIndex: 1 } as React.CSSProperties,
  board: {
    border: `1px solid ${Colors.DARK_GRAY3}`, borderRadius: 8,
    overflow: "hidden", background: Colors.DARK_GRAY4,
  } as React.CSSProperties,
  boardHeader: (color: string) => ({
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 14px", background: color, gap: 10,
  }) as React.CSSProperties,
  boardTitle: {
    display: "flex", alignItems: "center", gap: 8,
    fontWeight: 600, fontSize: "0.9rem", color: "#fff",
  } as React.CSSProperties,
  boardBody: { padding: 16 } as React.CSSProperties,
  configRow: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" as const,
  } as React.CSSProperties,
  configLabel: { fontWeight: 500, fontSize: "0.82rem", color: Colors.GRAY4, minWidth: 70 } as React.CSSProperties,
  resultArea: {
    marginTop: 8, background: Colors.DARK_GRAY3, borderRadius: 6, padding: 12,
    maxHeight: 360, overflowY: "auto" as const,
  } as React.CSSProperties,
  tableWrap: { overflowX: "auto" as const } as React.CSSProperties,
  summaryCards: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10,
  } as React.CSSProperties,
  summaryCard: {
    background: Colors.DARK_GRAY5, borderRadius: 6, padding: "14px 12px",
    textAlign: "center" as const,
  } as React.CSSProperties,
  summaryValue: { fontSize: "1.5rem", fontWeight: 700 } as React.CSSProperties,
  summaryLabel: { fontSize: "0.8rem", color: Colors.GRAY4, marginTop: 4 } as React.CSSProperties,
  barRow: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 8,
  } as React.CSSProperties,
  barLabel: {
    minWidth: 110, fontSize: "0.82rem", fontWeight: 500, textAlign: "right" as const, color: Colors.GRAY5,
  } as React.CSSProperties,
  barTrack: {
    flex: 1, height: 26, background: Colors.DARK_GRAY3, borderRadius: 4, overflow: "hidden",
  } as React.CSSProperties,
  barFill: (pct: number, color: string) => ({
    height: "100%", width: `${Math.max(pct, 1)}%`, background: color,
    borderRadius: 4, transition: "width 0.5s ease",
    display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6,
    fontSize: "0.75rem", fontWeight: 700, color: "#fff", minWidth: 24,
  }) as React.CSSProperties,
  barCount: { fontSize: "0.8rem", fontWeight: 600, minWidth: 40, color: Colors.GRAY5 } as React.CSSProperties,
  pieContainer: {
    display: "flex", alignItems: "center", gap: 32, justifyContent: "center", padding: 12,
  } as React.CSSProperties,
  pieCircle: (gradient: string) => ({
    width: 180, height: 180, borderRadius: "50%",
    background: gradient,
  }) as React.CSSProperties,
  pieLegend: { display: "flex", flexDirection: "column" as const, gap: 8 } as React.CSSProperties,
  pieLegendItem: {
    display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem",
  } as React.CSSProperties,
  pieSwatch: (color: string) => ({
    width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0,
  }) as React.CSSProperties,
  emptyState: {
    color: Colors.GRAY3, textAlign: "center" as const, padding: "20px 0", fontSize: "0.9rem",
  } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Contour() {
  /* --- State --- */
  const [ontologies, setOntologies] = useState<OntologyMeta[]>([]);
  const [selectedOntology, setSelectedOntology] = useState("");
  const [objectType, setObjectType] = useState("ServiceJob");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);

  const [boards, setBoards] = useState<Board[]>([]);

  /* derived property lists */
  const allProps = useMemo(() => inferProperties(rows), [rows]);
  const numericProps = useMemo(() => inferNumericProperties(rows), [rows]);
  const stringProps = useMemo(() => inferStringProperties(rows), [rows]);

  /* --- Bootstrap: fetch ontologies + initial data --- */
  useEffect(() => {
    (async () => {
      const onts = await fetchOntologies();
      setOntologies(onts);
      if (onts.length > 0) setSelectedOntology(onts[0].rid);
    })();
  }, []);

  /* --- Load objects whenever ontology or objectType changes --- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let data: Record<string, any>[] = [];
      if (selectedOntology) {
        data = await loadObjects(selectedOntology, objectType);
      }
      if (data.length === 0) {
        // fallback to mock data for ServiceJob
        if (objectType === "ServiceJob") data = getMockServiceJobs();
      }
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedOntology, objectType]);

  /* --- Pre-loaded analysis (set once when rows first load for ServiceJob) --- */
  const [defaultLoaded, setDefaultLoaded] = useState(false);
  useEffect(() => {
    if (!defaultLoaded && rows.length > 0 && objectType === "ServiceJob") {
      setDefaultLoaded(true);
      setBoards([
        {
          id: nextBoardId(),
          type: "filter",
          config: { property: "status", operator: "!=", value: "cancelled" },
        },
        {
          id: nextBoardId(),
          type: "groupby",
          config: { property: "pestType" },
        },
        {
          id: nextBoardId(),
          type: "chart",
          config: { property: "pestType", chartMode: "bar" as ChartMode },
        },
      ]);
    }
  }, [rows, objectType, defaultLoaded]);

  /* --- Pipeline evaluation (runs client-side on loaded rows) --- */
  const pipelineResult = useMemo(() => {
    let current = [...rows];
    const snapshots: { rows: Record<string, any>[]; grouped?: Record<string, Record<string, any>[]>; agg?: { key: string; value: number }[] }[] = [];

    for (const board of boards) {
      const snap: (typeof snapshots)[number] = { rows: [...current] };

      switch (board.type) {
        case "filter": {
          const prop = board.config.property as string;
          const op = (board.config.operator ?? "==") as string;
          const val = board.config.value as string;
          if (prop && val !== undefined && val !== "") {
            current = current.filter((r) => {
              const rv = String(r[prop] ?? "");
              if (op === "!=") return rv !== val;
              if (op === "contains") return rv.toLowerCase().includes(val.toLowerCase());
              return rv === val;
            });
            snap.rows = [...current];
          }
          break;
        }
        case "groupby": {
          const prop = board.config.property as string;
          if (prop) {
            const groups: Record<string, Record<string, any>[]> = {};
            for (const r of current) {
              const key = String(r[prop] ?? "(empty)");
              (groups[key] ??= []).push(r);
            }
            snap.grouped = groups;
          }
          break;
        }
        case "aggregate": {
          const prop = board.config.property as string;
          const func = (board.config.func ?? "count") as AggFunc;
          const groupProp = board.config.groupBy as string;

          if (groupProp) {
            const groups: Record<string, Record<string, any>[]> = {};
            for (const r of current) {
              const key = String(r[groupProp] ?? "(empty)");
              (groups[key] ??= []).push(r);
            }
            const agg: { key: string; value: number }[] = [];
            for (const [key, items] of Object.entries(groups)) {
              let v = 0;
              if (func === "count") v = items.length;
              else if (func === "sum") v = items.reduce((s, r) => s + (Number(r[prop]) || 0), 0);
              else if (func === "avg") {
                const nums = items.map((r) => Number(r[prop])).filter((n) => !Number.isNaN(n));
                v = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
              }
              agg.push({ key, value: Math.round(v * 100) / 100 });
            }
            agg.sort((a, b) => b.value - a.value);
            snap.agg = agg;
          } else {
            let v = 0;
            if (func === "count") v = current.length;
            else if (func === "sum") v = current.reduce((s, r) => s + (Number(r[prop]) || 0), 0);
            else if (func === "avg") {
              const nums = current.map((r) => Number(r[prop])).filter((n) => !Number.isNaN(n));
              v = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
            }
            snap.agg = [{ key: "Total", value: Math.round(v * 100) / 100 }];
          }
          break;
        }
        case "chart": {
          const prop = board.config.property as string;
          if (prop) {
            const counts: Record<string, number> = {};
            for (const r of current) {
              const key = String(r[prop] ?? "(empty)");
              counts[key] = (counts[key] ?? 0) + 1;
            }
            const agg = Object.entries(counts)
              .map(([key, value]) => ({ key, value }))
              .sort((a, b) => b.value - a.value);
            snap.agg = agg;
          }
          break;
        }
        case "table":
        default:
          break;
      }
      snapshots.push(snap);
    }
    return snapshots;
  }, [rows, boards]);

  /* --- Board mutations --- */
  const addBoard = useCallback((type: BoardType, afterIndex: number) => {
    const newBoard: Board = { id: nextBoardId(), type, config: {} };
    // set sensible defaults
    if (type === "groupby" && stringProps.length) newBoard.config.property = stringProps[0];
    if (type === "chart" && stringProps.length) {
      newBoard.config.property = stringProps[0];
      newBoard.config.chartMode = "bar";
    }
    if (type === "aggregate") {
      newBoard.config.func = "count";
      if (stringProps.length) newBoard.config.groupBy = stringProps[0];
    }
    if (type === "filter" && stringProps.length) {
      newBoard.config.property = stringProps[0];
      newBoard.config.operator = "==";
      newBoard.config.value = "";
    }
    setBoards((prev) => {
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newBoard);
      return next;
    });
  }, [stringProps]);

  const removeBoard = useCallback((id: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const updateBoardConfig = useCallback((id: string, patch: Record<string, any>) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === id ? { ...b, config: { ...b.config, ...patch } } : b)),
    );
  }, []);

  /* --- Distinct values for a property (for filter dropdowns) --- */
  const distinctValues = useCallback(
    (prop: string) => {
      const set = new Set<string>();
      for (const r of rows) {
        if (r[prop] != null) set.add(String(r[prop]));
      }
      return Array.from(set).sort();
    },
    [rows],
  );

  /* --- Render helpers --- */

  function renderAddMenu(afterIndex: number) {
    return (
      <div style={S.connector}>
        <div style={S.connectorLine} />
        <div style={S.addBtn}>
          {(["table", "filter", "groupby", "aggregate", "chart"] as BoardType[]).map((t) => (
            <Button
              key={t}
              small
              minimal
              icon={BOARD_META[t].icon}
              title={`Add ${BOARD_META[t].label}`}
              onClick={() => addBoard(t, afterIndex)}
              style={{ margin: "0 2px" }}
            />
          ))}
        </div>
      </div>
    );
  }

  function renderTable(data: Record<string, any>[], maxRows = 50) {
    if (data.length === 0) return <div style={S.emptyState}>No data</div>;
    const cols = inferProperties(data);
    const display = data.slice(0, maxRows);
    return (
      <div style={S.tableWrap}>
        <HTMLTable bordered condensed striped style={{ width: "100%", fontSize: "0.8rem" }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} style={{ whiteSpace: "nowrap" }}>{prettyHeader(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} style={{ whiteSpace: "nowrap" }}>{formatCell(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </HTMLTable>
        {data.length > maxRows && (
          <div style={{ ...S.emptyState, paddingTop: 8 }}>
            Showing {maxRows} of {data.length} rows
          </div>
        )}
      </div>
    );
  }

  function renderBarChart(agg: { key: string; value: number }[]) {
    if (agg.length === 0) return <div style={S.emptyState}>No data to chart</div>;
    const max = Math.max(...agg.map((a) => a.value), 1);
    return (
      <div>
        {agg.map((a, i) => (
          <div key={a.key} style={S.barRow}>
            <div style={S.barLabel}>{a.key}</div>
            <div style={S.barTrack}>
              <div style={S.barFill((a.value / max) * 100, PALETTE[i % PALETTE.length])}>
                {a.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderPieChart(agg: { key: string; value: number }[]) {
    if (agg.length === 0) return <div style={S.emptyState}>No data to chart</div>;
    const total = agg.reduce((s, a) => s + a.value, 0) || 1;
    // Build conic-gradient
    const segments: string[] = [];
    let cumPct = 0;
    for (let i = 0; i < agg.length; i++) {
      const pct = (agg[i].value / total) * 100;
      segments.push(`${PALETTE[i % PALETTE.length]} ${cumPct}% ${cumPct + pct}%`);
      cumPct += pct;
    }
    const gradient = `conic-gradient(${segments.join(", ")})`;

    return (
      <div style={S.pieContainer}>
        <div style={S.pieCircle(gradient)} />
        <div style={S.pieLegend}>
          {agg.map((a, i) => (
            <div key={a.key} style={S.pieLegendItem}>
              <div style={S.pieSwatch(PALETTE[i % PALETTE.length])} />
              <span>{a.key}</span>
              <span style={{ color: Colors.GRAY4, marginLeft: 4 }}>
                ({a.value} &middot; {Math.round((a.value / total) * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderGrouped(grouped: Record<string, Record<string, any>[]>) {
    const entries = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
    return (
      <div>
        {entries.map(([key, items]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Tag minimal round intent="primary">{key}</Tag>
              <span style={{ fontSize: "0.8rem", color: Colors.GRAY4 }}>{items.length} objects</span>
            </div>
            {renderTable(items, 10)}
          </div>
        ))}
      </div>
    );
  }

  function renderSummaryCards(agg: { key: string; value: number }[]) {
    return (
      <div style={S.summaryCards}>
        {agg.map((a) => (
          <div key={a.key} style={S.summaryCard}>
            <div style={S.summaryValue}>{a.value > 10000 ? formatRupiah(a.value) : a.value.toLocaleString("id-ID")}</div>
            <div style={S.summaryLabel}>{a.key}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderBoardBody(board: Board, index: number) {
    const snap = pipelineResult[index];
    if (!snap) return null;

    switch (board.type) {
      case "table":
        return (
          <div style={S.boardBody}>
            <div style={S.resultArea}>{renderTable(snap.rows)}</div>
          </div>
        );

      case "filter": {
        const prop = board.config.property as string;
        const op = (board.config.operator ?? "==") as string;
        const vals = prop ? distinctValues(prop) : [];
        return (
          <div style={S.boardBody}>
            <div style={S.configRow}>
              <span style={S.configLabel}>Property</span>
              <HTMLSelect
                value={prop || ""}
                onChange={(e) => updateBoardConfig(board.id, { property: e.target.value, value: "" })}
                options={["", ...allProps]}
                style={{ minWidth: 140 }}
              />
              <HTMLSelect
                value={op}
                onChange={(e) => updateBoardConfig(board.id, { operator: e.target.value })}
                options={["==", "!=", "contains"]}
                style={{ minWidth: 80 }}
              />
              <HTMLSelect
                value={board.config.value ?? ""}
                onChange={(e) => updateBoardConfig(board.id, { value: e.target.value })}
                options={["", ...vals]}
                style={{ minWidth: 140 }}
              />
            </div>
            <div style={{ fontSize: "0.8rem", color: Colors.GRAY4 }}>
              {snap.rows.length} rows after filter
            </div>
          </div>
        );
      }

      case "groupby": {
        const prop = board.config.property as string;
        return (
          <div style={S.boardBody}>
            <div style={S.configRow}>
              <span style={S.configLabel}>Group by</span>
              <HTMLSelect
                value={prop || ""}
                onChange={(e) => updateBoardConfig(board.id, { property: e.target.value })}
                options={["", ...stringProps]}
                style={{ minWidth: 160 }}
              />
            </div>
            {snap.grouped ? (
              <div style={S.resultArea}>{renderGrouped(snap.grouped)}</div>
            ) : (
              <div style={S.emptyState}>Select a property to group by</div>
            )}
          </div>
        );
      }

      case "aggregate": {
        const func = (board.config.func ?? "count") as AggFunc;
        const prop = board.config.property as string;
        const groupBy = board.config.groupBy as string;
        return (
          <div style={S.boardBody}>
            <div style={S.configRow}>
              <span style={S.configLabel}>Function</span>
              <HTMLSelect
                value={func}
                onChange={(e) => updateBoardConfig(board.id, { func: e.target.value })}
                options={["count", "sum", "avg"]}
                style={{ minWidth: 100 }}
              />
              {func !== "count" && (
                <>
                  <span style={S.configLabel}>on</span>
                  <HTMLSelect
                    value={prop || ""}
                    onChange={(e) => updateBoardConfig(board.id, { property: e.target.value })}
                    options={["", ...numericProps]}
                    style={{ minWidth: 140 }}
                  />
                </>
              )}
              <span style={S.configLabel}>Group by</span>
              <HTMLSelect
                value={groupBy || ""}
                onChange={(e) => updateBoardConfig(board.id, { groupBy: e.target.value })}
                options={["(none)", ...stringProps]}
                style={{ minWidth: 140 }}
              />
            </div>
            {snap.agg ? (
              <div style={S.resultArea}>{renderSummaryCards(snap.agg)}</div>
            ) : (
              <div style={S.emptyState}>Configure aggregation above</div>
            )}
          </div>
        );
      }

      case "chart": {
        const prop = board.config.property as string;
        const chartMode = (board.config.chartMode ?? "bar") as ChartMode;
        return (
          <div style={S.boardBody}>
            <div style={S.configRow}>
              <span style={S.configLabel}>Property</span>
              <HTMLSelect
                value={prop || ""}
                onChange={(e) => updateBoardConfig(board.id, { property: e.target.value })}
                options={["", ...stringProps]}
                style={{ minWidth: 160 }}
              />
              <span style={S.configLabel}>Chart</span>
              <HTMLSelect
                value={chartMode}
                onChange={(e) => updateBoardConfig(board.id, { chartMode: e.target.value })}
                options={["bar", "pie"]}
                style={{ minWidth: 80 }}
              />
            </div>
            {snap.agg && snap.agg.length > 0 ? (
              <div style={S.resultArea}>
                {chartMode === "bar" ? renderBarChart(snap.agg) : renderPieChart(snap.agg)}
              </div>
            ) : (
              <div style={S.emptyState}>Select a property to chart</div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  }

  /* --- Main render --- */
  return (
    <>
      <PageHeader
        title="Contour — Interactive Analysis"
        actions={
          <Tag large minimal icon="chart">
            {boards.length} analysis step{boards.length !== 1 ? "s" : ""}
          </Tag>
        }
      />

      <div style={S.page}>
        {/* -------- Top bar: data source selector -------- */}
        <div style={S.topBar}>
          <span style={S.topLabel}>Ontology</span>
          <HTMLSelect
            value={selectedOntology}
            onChange={(e) => setSelectedOntology(e.target.value)}
            options={
              ontologies.length > 0
                ? ontologies.map((o) => ({ label: o.displayName, value: o.rid }))
                : [{ label: "(discovering...)", value: "" }]
            }
            style={{ minWidth: 180 }}
          />

          <span style={S.topLabel}>Object Type</span>
          <HTMLSelect
            value={objectType}
            onChange={(e) => {
              setObjectType(e.target.value);
              setBoards([]);
              setDefaultLoaded(false);
            }}
            options={OBJECT_TYPES}
            style={{ minWidth: 160 }}
          />

          {loading ? (
            <Spinner size={18} />
          ) : (
            <Tag round minimal intent="success" icon="database" large>
              {rows.length} objects loaded
            </Tag>
          )}
        </div>

        {/* -------- Pipeline of analysis boards -------- */}
        {loading ? (
          <Card elevation={Elevation.TWO} style={{ textAlign: "center", padding: 48, borderRadius: 8 }}>
            <Spinner size={36} />
            <p style={{ marginTop: 16, color: Colors.GRAY4 }}>Loading {objectType} data...</p>
          </Card>
        ) : (
          <div style={S.pipeline}>
            {/* Add-step button at the very top */}
            {boards.length === 0 && (
              <Card
                elevation={Elevation.ONE}
                style={{
                  textAlign: "center", padding: "32px 16px", borderRadius: 8,
                  border: `2px dashed ${Colors.GRAY3}`, background: "transparent",
                }}
              >
                <Icon icon="plus" size={24} color={Colors.GRAY3} />
                <p style={{ color: Colors.GRAY4, margin: "12px 0 16px" }}>
                  Add your first analysis step
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {(["table", "filter", "groupby", "aggregate", "chart"] as BoardType[]).map((t) => (
                    <Button
                      key={t}
                      icon={BOARD_META[t].icon}
                      text={BOARD_META[t].label}
                      onClick={() => addBoard(t, -1)}
                    />
                  ))}
                </div>
              </Card>
            )}

            {boards.map((board, idx) => {
              const meta = BOARD_META[board.type];
              return (
                <div key={board.id}>
                  {/* Board card */}
                  <div style={S.board}>
                    <div style={S.boardHeader(meta.color)}>
                      <div style={S.boardTitle}>
                        <Icon icon={meta.icon} size={16} color="#fff" />
                        <span>Step {idx + 1}: {meta.label}</span>
                      </div>
                      <Button
                        small
                        minimal
                        icon="cross"
                        onClick={() => removeBoard(board.id)}
                        style={{ color: "#fff" }}
                      />
                    </div>
                    {renderBoardBody(board, idx)}
                  </div>

                  {/* Connector with add buttons */}
                  {renderAddMenu(idx)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
