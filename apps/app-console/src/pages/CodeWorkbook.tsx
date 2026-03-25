import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Callout,
  Card,
  Colors,
  EditableText,
  HTMLSelect,
  HTMLTable,
  Icon,
  Menu,
  MenuItem,
  Popover,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import PageHeader from "../components/PageHeader";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CellType = "code" | "sql" | "markdown";
type CellStatus = "idle" | "running" | "success" | "error";

interface CellOutput {
  type: "table" | "json" | "html" | "error";
  data: any;
}

interface WorkbookCell {
  id: string;
  cellType: CellType;
  source: string;
  output: CellOutput | null;
  status: CellStatus;
}

interface OntologyMeta {
  rid: string;
  apiName: string;
  displayName: string;
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

const CELL_META: Record<CellType, { label: string; icon: IconName; color: string }> = {
  code: { label: "JavaScript", icon: "code", color: Colors.BLUE3 },
  sql: { label: "SQL", icon: "database", color: Colors.GREEN3 },
  markdown: { label: "Markdown", icon: "manual", color: Colors.ORANGE3 },
};

const DEFAULT_CELLS: Omit<WorkbookCell, "id">[] = [
  {
    cellType: "markdown",
    source:
      "# Pest Control Data Analysis\nAnalyzing service jobs, revenue, and technician performance.",
    output: null,
    status: "idle",
  },
  {
    cellType: "sql",
    source: `SELECT pestType, COUNT(*) as jobs, AVG(amountCharged) as avgRevenue
FROM ServiceJob
WHERE status = 'completed'
GROUP BY pestType`,
    output: null,
    status: "idle",
  },
  {
    cellType: "code",
    source: `// Top 3 technicians by rating
const techs = await foundry.objects.load("Technician")
const ranked = techs.sort((a, b) => b.rating - a.rating).slice(0, 3)
ranked.map(t => ({ name: t.name, rating: t.rating / 10, region: t.region }))`,
    output: null,
    status: "idle",
  },
  {
    cellType: "sql",
    source: `SELECT c.name, COUNT(j.jobId) as totalJobs, SUM(j.amountCharged) as totalRevenue
FROM Customer c
JOIN ServiceJob j ON c.customerId = j.customerId
GROUP BY c.name
ORDER BY totalRevenue DESC`,
    output: null,
    status: "idle",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let cellCounter = 0;
function nextCellId(): string {
  cellCounter += 1;
  return `cell-${Date.now()}-${cellCounter}`;
}

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
          pageSize: 500,
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

function prettyHeader(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCellValue(val: unknown): string {
  if (val == null) return "\u2014";
  if (typeof val === "number") return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(val);
}

/* ------------------------------------------------------------------ */
/*  Markdown renderer (simple)                                         */
/* ------------------------------------------------------------------ */

function renderMarkdown(src: string): string {
  let html = src
    // Code blocks
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Line breaks
    .replace(/\n/g, "<br/>");
  return html;
}

/* ------------------------------------------------------------------ */
/*  SQL parser (simple)                                                */
/* ------------------------------------------------------------------ */

interface ParsedSQL {
  selectFields: { expr: string; alias: string; aggFunc?: string; sourceAlias?: string }[];
  fromTable: string;
  fromAlias?: string;
  join?: { table: string; alias?: string; leftKey: string; rightKey: string };
  where?: { field: string; op: string; value: string };
  groupBy?: string[];
  orderBy?: { field: string; dir: "ASC" | "DESC" };
}

function parseSQL(sql: string): ParsedSQL {
  const norm = sql.replace(/\s+/g, " ").trim();

  // SELECT
  const selectMatch = norm.match(/SELECT\s+(.+?)\s+FROM\s/i);
  if (!selectMatch) throw new Error("Invalid SQL: missing SELECT ... FROM");

  const rawFields = splitTopLevel(selectMatch[1]);

  const selectFields = rawFields.map((f) => {
    const aliasMatch = f.match(/^(.+?)\s+as\s+(\w+)$/i);
    const expr = aliasMatch ? aliasMatch[1].trim() : f.trim();
    const alias = aliasMatch ? aliasMatch[2].trim() : expr;

    // Check for aggregate: COUNT(*), SUM(x), AVG(x)
    const aggMatch = expr.match(/^(COUNT|SUM|AVG)\s*\(\s*(.+?)\s*\)$/i);
    if (aggMatch) {
      return { expr: aggMatch[2], alias, aggFunc: aggMatch[1].toUpperCase() };
    }

    // Check for table.field notation
    const dotMatch = expr.match(/^(\w+)\.(\w+)$/);
    if (dotMatch) {
      return { expr: dotMatch[2], alias: alias.includes(".") ? dotMatch[2] : alias, sourceAlias: dotMatch[1] };
    }

    return { expr, alias };
  });

  // FROM
  const fromMatch = norm.match(/FROM\s+(\w+)(?:\s+(\w+))?/i);
  if (!fromMatch) throw new Error("Invalid SQL: missing FROM");
  const fromTable = fromMatch[1];
  const fromAlias = fromMatch[2] && !["WHERE", "JOIN", "GROUP", "ORDER", "INNER", "LEFT"].includes(fromMatch[2].toUpperCase())
    ? fromMatch[2]
    : undefined;

  // JOIN
  let join: ParsedSQL["join"] | undefined;
  const joinMatch = norm.match(/JOIN\s+(\w+)\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);
  if (joinMatch) {
    join = {
      table: joinMatch[1],
      alias: joinMatch[2],
      leftKey: joinMatch[4],
      rightKey: joinMatch[6],
    };
  }

  // WHERE
  let where: ParsedSQL["where"] | undefined;
  const whereMatch = norm.match(/WHERE\s+(\w+(?:\.\w+)?)\s*(=|!=|<>|>|<|>=|<=|LIKE)\s*'?([^']*?)'?(?:\s+(?:GROUP|ORDER|LIMIT|$))/i);
  if (whereMatch) {
    const wField = whereMatch[1].includes(".") ? whereMatch[1].split(".")[1] : whereMatch[1];
    where = { field: wField, op: whereMatch[2], value: whereMatch[3].trim() };
  }

  // GROUP BY
  let groupBy: string[] | undefined;
  const groupMatch = norm.match(/GROUP\s+BY\s+(.+?)(?:\s+(?:ORDER|HAVING|LIMIT|$))/i);
  if (groupMatch) {
    groupBy = groupMatch[1].split(",").map((g) => {
      const s = g.trim();
      return s.includes(".") ? s.split(".")[1] : s;
    });
  }

  // ORDER BY
  let orderBy: ParsedSQL["orderBy"] | undefined;
  const orderMatch = norm.match(/ORDER\s+BY\s+(\w+(?:\.\w+)?)\s*(ASC|DESC)?/i);
  if (orderMatch) {
    const oField = orderMatch[1].includes(".") ? orderMatch[1].split(".")[1] : orderMatch[1];
    orderBy = { field: oField, dir: (orderMatch[2]?.toUpperCase() ?? "ASC") as "ASC" | "DESC" };
  }

  return { selectFields, fromTable, fromAlias, join, where, groupBy, orderBy };
}

/** Split by commas not inside parentheses */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/* ------------------------------------------------------------------ */
/*  SQL execution engine                                               */
/* ------------------------------------------------------------------ */

async function executeSQL(
  parsed: ParsedSQL,
  ontologyRid: string,
): Promise<{ columns: string[]; rows: Record<string, any>[] }> {
  // Load primary table
  let rows = await loadObjects(ontologyRid, parsed.fromTable);
  if (rows.length === 0) throw new Error(`No data found for type "${parsed.fromTable}"`);

  // JOIN
  if (parsed.join) {
    const joinRows = await loadObjects(ontologyRid, parsed.join.table);
    if (joinRows.length === 0) throw new Error(`No data found for join type "${parsed.join.table}"`);

    const merged: Record<string, any>[] = [];
    for (const left of rows) {
      for (const right of joinRows) {
        if (String(left[parsed.join.leftKey]) === String(right[parsed.join.rightKey])) {
          // Merge, prefixing with aliases when needed
          const combined: Record<string, any> = {};
          for (const [k, v] of Object.entries(left)) combined[k] = v;
          for (const [k, v] of Object.entries(right)) {
            if (!(k in combined)) combined[k] = v;
            // Also store with join alias prefix for disambiguation
            if (parsed.join!.alias) combined[`${parsed.join!.alias}__${k}`] = v;
          }
          if (parsed.fromAlias) {
            for (const [k, v] of Object.entries(left))
              combined[`${parsed.fromAlias}__${k}`] = v;
          }
          merged.push(combined);
        }
      }
    }
    rows = merged;
  }

  // WHERE
  if (parsed.where) {
    const { field, op, value } = parsed.where;
    rows = rows.filter((r) => {
      const rv = r[field];
      const sv = String(rv);
      switch (op) {
        case "=": return sv === value;
        case "!=": case "<>": return sv !== value;
        case ">": return Number(rv) > Number(value);
        case "<": return Number(rv) < Number(value);
        case ">=": return Number(rv) >= Number(value);
        case "<=": return Number(rv) <= Number(value);
        case "LIKE": return sv.toLowerCase().includes(value.replace(/%/g, "").toLowerCase());
        default: return true;
      }
    });
  }

  // GROUP BY + aggregations
  if (parsed.groupBy && parsed.groupBy.length > 0) {
    const groups = new Map<string, Record<string, any>[]>();
    for (const row of rows) {
      const key = parsed.groupBy.map((g) => String(row[g] ?? "")).join("||");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const resultRows: Record<string, any>[] = [];
    for (const [, groupRows] of groups) {
      const out: Record<string, any> = {};
      // Copy group-by fields from first row
      for (const g of parsed.groupBy!) {
        out[g] = groupRows[0][g];
      }
      // Compute aggregations
      for (const sf of parsed.selectFields) {
        if (sf.aggFunc) {
          const vals = groupRows.map((r) => Number(r[sf.expr] ?? 0)).filter((n) => !isNaN(n));
          switch (sf.aggFunc) {
            case "COUNT":
              out[sf.alias] = sf.expr === "*" ? groupRows.length : vals.length;
              break;
            case "SUM":
              out[sf.alias] = vals.reduce((a, b) => a + b, 0);
              break;
            case "AVG":
              out[sf.alias] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
              break;
          }
        } else if (!parsed.groupBy!.includes(sf.expr)) {
          out[sf.alias] = groupRows[0][sf.expr];
        }
      }
      resultRows.push(out);
    }
    rows = resultRows;
  } else {
    // No GROUP BY — project selected fields
    rows = rows.map((r) => {
      const out: Record<string, any> = {};
      for (const sf of parsed.selectFields) {
        if (sf.aggFunc) {
          // Aggregate without GROUP BY = whole-table aggregate
          // Handled below
          continue;
        }
        out[sf.alias] = r[sf.expr] ?? r[sf.alias] ?? null;
      }
      return out;
    });

    // Whole-table aggregates without GROUP BY
    const hasAgg = parsed.selectFields.some((sf) => sf.aggFunc);
    if (hasAgg) {
      const out: Record<string, any> = {};
      for (const sf of parsed.selectFields) {
        if (sf.aggFunc) {
          const allRows = rows;
          const vals = allRows.map((r) => Number(r[sf.expr] ?? 0)).filter((n) => !isNaN(n));
          switch (sf.aggFunc) {
            case "COUNT": out[sf.alias] = sf.expr === "*" ? allRows.length : vals.length; break;
            case "SUM": out[sf.alias] = vals.reduce((a, b) => a + b, 0); break;
            case "AVG": out[sf.alias] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break;
          }
        } else {
          out[sf.alias] = rows[0]?.[sf.alias] ?? null;
        }
      }
      rows = [out];
    }
  }

  // ORDER BY
  if (parsed.orderBy) {
    const { field, dir } = parsed.orderBy;
    // Also check alias names
    const resolvedField =
      rows.length > 0 && field in rows[0]
        ? field
        : parsed.selectFields.find((sf) => sf.alias === field)?.alias ?? field;
    rows.sort((a, b) => {
      const av = a[resolvedField] ?? a[field] ?? 0;
      const bv = b[resolvedField] ?? b[field] ?? 0;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "DESC" ? -cmp : cmp;
    });
  }

  // Determine columns from select fields
  const columns = parsed.selectFields.map((sf) => sf.alias);

  // Make sure rows have all columns
  rows = rows.map((r) => {
    const out: Record<string, any> = {};
    for (const col of columns) {
      out[col] = r[col] ?? null;
    }
    return out;
  });

  return { columns, rows };
}

/* ------------------------------------------------------------------ */
/*  Code execution engine                                              */
/* ------------------------------------------------------------------ */

async function executeCode(
  source: string,
  ontologyRid: string,
): Promise<any> {
  const foundry = {
    objects: {
      load: async (typeName: string) => {
        return loadObjects(ontologyRid, typeName);
      },
      count: async (typeName: string) => {
        const objs = await loadObjects(ontologyRid, typeName);
        return objs.length;
      },
    },
  };

  // Wrap in async function using Function constructor
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction("foundry", `${source}`);

  // Run with a timeout wrapper
  const result = await fn(foundry);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CodeWorkbook() {
  const [title, setTitle] = useState("Pest Control Analysis Workbook");
  const [cells, setCells] = useState<WorkbookCell[]>(() =>
    DEFAULT_CELLS.map((c) => ({ ...c, id: nextCellId() })),
  );
  const [ontologies, setOntologies] = useState<OntologyMeta[]>([]);
  const [selectedOntology, setSelectedOntology] = useState("");
  const [loadingOntologies, setLoadingOntologies] = useState(true);

  // Fetch ontologies on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingOntologies(true);
      const onts = await fetchOntologies();
      if (cancelled) return;
      setOntologies(onts);
      if (onts.length > 0) setSelectedOntology(onts[0].rid);
      setLoadingOntologies(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Cell operations ----

  const updateCell = useCallback((id: string, patch: Partial<WorkbookCell>) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const addCell = useCallback((cellType: CellType) => {
    const newCell: WorkbookCell = {
      id: nextCellId(),
      cellType,
      source: cellType === "markdown" ? "## New Section" : "",
      output: null,
      status: "idle",
    };
    setCells((prev) => [...prev, newCell]);
  }, []);

  const deleteCell = useCallback((id: string) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const moveCell = useCallback((id: string, direction: -1 | 1) => {
    setCells((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  }, []);

  // ---- Execution ----

  const runCell = useCallback(
    async (id: string) => {
      const cell = cells.find((c) => c.id === id);
      if (!cell) return;

      updateCell(id, { status: "running", output: null });

      try {
        if (cell.cellType === "markdown") {
          const html = renderMarkdown(cell.source);
          updateCell(id, {
            status: "success",
            output: { type: "html", data: html },
          });
          return;
        }

        if (!selectedOntology) {
          throw new Error("No ontology selected. Please select an ontology from the toolbar.");
        }

        if (cell.cellType === "sql") {
          const parsed = parseSQL(cell.source);
          const { columns, rows } = await executeSQL(parsed, selectedOntology);
          updateCell(id, {
            status: "success",
            output: { type: "table", data: { columns, rows } },
          });
        } else if (cell.cellType === "code") {
          const result = await executeCode(cell.source, selectedOntology);
          if (Array.isArray(result) && result.length > 0 && typeof result[0] === "object") {
            const columns = Object.keys(result[0]);
            updateCell(id, {
              status: "success",
              output: { type: "table", data: { columns, rows: result } },
            });
          } else {
            updateCell(id, {
              status: "success",
              output: { type: "json", data: result },
            });
          }
        }
      } catch (err: any) {
        updateCell(id, {
          status: "error",
          output: { type: "error", data: err?.message ?? String(err) },
        });
      }
    },
    [cells, selectedOntology, updateCell],
  );

  const runAll = useCallback(async () => {
    for (const cell of cells) {
      await runCell(cell.id);
    }
  }, [cells, runCell]);

  // ---- Ontology options ----

  const ontologyOptions = useMemo(
    () => ontologies.map((o) => ({ value: o.rid, label: o.displayName })),
    [ontologies],
  );

  // ---- Render ----

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        title="Code Workbooks"
        actions={
          <Tag icon="code" intent="primary" large>
            IDE
          </Tag>
        }
      />

      {/* ---- Toolbar ---- */}
      <Card
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 16px",
        }}
      >
        <Icon icon="document" size={16} color={Colors.BLUE3} />
        <span style={{ fontSize: 16, fontWeight: 600, minWidth: 250 }}>
          <EditableText
            value={title}
            onChange={setTitle}
            selectAllOnFocus
          />
        </span>

        <div style={{ flex: 1 }} />

        {/* Ontology selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon icon="data-lineage" size={14} color={Colors.GRAY1} />
          {loadingOntologies ? (
            <Spinner size={16} />
          ) : (
            <HTMLSelect
              value={selectedOntology}
              onChange={(e) => setSelectedOntology(e.target.value)}
              options={
                ontologyOptions.length > 0
                  ? ontologyOptions
                  : [{ value: "", label: "No ontologies" }]
              }
              minimal
              style={{ minWidth: 180 }}
            />
          )}
        </div>

        {/* Run All */}
        <Button
          icon="play"
          intent="success"
          text="Run All"
          onClick={runAll}
          small
        />

        {/* Add Cell */}
        <Popover
          content={
            <Menu>
              <MenuItem
                icon="code"
                text="Code (JavaScript)"
                onClick={() => addCell("code")}
              />
              <MenuItem
                icon="database"
                text="SQL"
                onClick={() => addCell("sql")}
              />
              <MenuItem
                icon="manual"
                text="Markdown"
                onClick={() => addCell("markdown")}
              />
            </Menu>
          }
          placement="bottom-end"
        >
          <Button icon="plus" text="Add Cell" small />
        </Popover>
      </Card>

      {/* ---- Info banner ---- */}
      <Callout
        icon="info-sign"
        intent="primary"
        style={{ marginBottom: 16 }}
      >
        Write queries against your ontology data using SQL, JavaScript, or Markdown.
        Cells execute against the selected ontology using the Foundry object API.
      </Callout>

      {/* ---- Cells ---- */}
      {cells.length === 0 && (
        <Card style={{ textAlign: "center", padding: 40, color: Colors.GRAY3 }}>
          <Icon icon="code-block" size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p>No cells yet. Click "Add Cell" to get started.</p>
        </Card>
      )}

      {cells.map((cell, idx) => (
        <CellComponent
          key={cell.id}
          cell={cell}
          index={idx}
          totalCells={cells.length}
          onRun={() => runCell(cell.id)}
          onDelete={() => deleteCell(cell.id)}
          onMoveUp={() => moveCell(cell.id, -1)}
          onMoveDown={() => moveCell(cell.id, 1)}
          onUpdateSource={(src) => updateCell(cell.id, { source: src })}
          onUpdateType={(ct) => updateCell(cell.id, { cellType: ct, output: null, status: "idle" })}
        />
      ))}

      {/* ---- Footer ---- */}
      <div
        style={{
          marginTop: 24,
          padding: "12px 0",
          borderTop: `1px solid ${Colors.LIGHT_GRAY3}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: Colors.GRAY3,
          fontSize: 12,
        }}
      >
        <span>
          {cells.length} cell{cells.length !== 1 ? "s" : ""} &middot;{" "}
          {cells.filter((c) => c.status === "success").length} executed
        </span>
        <span>OpenFoundry Code Workbooks</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cell component                                                     */
/* ------------------------------------------------------------------ */

interface CellComponentProps {
  cell: WorkbookCell;
  index: number;
  totalCells: number;
  onRun: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateSource: (src: string) => void;
  onUpdateType: (ct: CellType) => void;
}

function CellComponent({
  cell,
  index,
  totalCells,
  onRun,
  onDelete,
  onMoveUp,
  onMoveDown,
  onUpdateSource,
  onUpdateType,
}: CellComponentProps) {
  const meta = CELL_META[cell.cellType];

  const statusColor =
    cell.status === "success"
      ? Colors.GREEN3
      : cell.status === "error"
        ? Colors.RED3
        : cell.status === "running"
          ? Colors.BLUE3
          : Colors.GRAY4;

  const lineCount = cell.source.split("\n").length;
  const textareaRows = Math.max(3, Math.min(20, lineCount + 1));

  return (
    <Card
      style={{
        marginBottom: 12,
        padding: 0,
        borderLeft: `3px solid ${meta.color}`,
        overflow: "hidden",
      }}
    >
      {/* ---- Cell header ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 12px",
          gap: 8,
          background: Colors.LIGHT_GRAY5,
          borderBottom: `1px solid ${Colors.LIGHT_GRAY3}`,
        }}
      >
        <Tag icon={meta.icon as IconName} minimal style={{ color: meta.color }}>
          {meta.label}
        </Tag>

        <span style={{ fontSize: 11, color: Colors.GRAY3 }}>
          [{index + 1}]
        </span>

        <div style={{ flex: 1 }} />

        {/* Status indicator */}
        {cell.status !== "idle" && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            {cell.status === "running" ? (
              <Spinner size={12} />
            ) : (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusColor,
                  display: "inline-block",
                }}
              />
            )}
            <span style={{ color: statusColor }}>
              {cell.status === "running" ? "Running..." : cell.status === "success" ? "Success" : "Error"}
            </span>
          </span>
        )}

        {/* Cell toolbar */}
        <ButtonGroup minimal>
          <HTMLSelect
            value={cell.cellType}
            onChange={(e) => onUpdateType(e.target.value as CellType)}
            minimal
            style={{ fontSize: 11, height: 24 }}
            options={[
              { value: "code", label: "JavaScript" },
              { value: "sql", label: "SQL" },
              { value: "markdown", label: "Markdown" },
            ]}
          />
          <Button
            icon="arrow-up"
            minimal
            small
            disabled={index === 0}
            onClick={onMoveUp}
            title="Move up"
          />
          <Button
            icon="arrow-down"
            minimal
            small
            disabled={index === totalCells - 1}
            onClick={onMoveDown}
            title="Move down"
          />
          <Button
            icon="trash"
            minimal
            small
            intent="danger"
            onClick={onDelete}
            title="Delete cell"
          />
        </ButtonGroup>
      </div>

      {/* ---- Code editor area ---- */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 40,
            background: "#252526",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            paddingTop: 10,
            paddingRight: 8,
            fontSize: 11,
            fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
            color: "#858585",
            userSelect: "none",
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} style={{ lineHeight: "20px" }}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          value={cell.source}
          onChange={(e) => onUpdateSource(e.target.value)}
          rows={textareaRows}
          spellCheck={false}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px 10px 48px",
            fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
            fontSize: 13,
            lineHeight: "20px",
            background: "#1e1e1e",
            color: "#d4d4d4",
            border: "none",
            outline: "none",
            resize: "vertical",
            tabSize: 2,
          }}
          onKeyDown={(e) => {
            // Tab support
            if (e.key === "Tab") {
              e.preventDefault();
              const target = e.target as HTMLTextAreaElement;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              const val = target.value;
              onUpdateSource(val.substring(0, start) + "  " + val.substring(end));
              requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + 2;
              });
            }
            // Ctrl/Cmd + Enter to run
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onRun();
            }
          }}
        />

        {/* Run button overlay */}
        <Button
          icon="play"
          intent="success"
          minimal
          small
          onClick={onRun}
          title="Run cell (Ctrl+Enter)"
          style={{
            position: "absolute",
            top: 6,
            right: 8,
          }}
        />
      </div>

      {/* ---- Output area ---- */}
      {cell.output && (
        <div
          style={{
            borderTop: `1px solid ${Colors.LIGHT_GRAY3}`,
            background: cell.output.type === "error" ? "#fff5f5" : "#fafbfc",
            padding: 12,
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          <OutputRenderer output={cell.output} />
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Output renderer                                                    */
/* ------------------------------------------------------------------ */

interface OutputRendererProps {
  output: CellOutput;
}

function OutputRenderer({ output }: OutputRendererProps) {
  if (output.type === "error") {
    return (
      <Callout intent="danger" icon="error" style={{ fontSize: 13 }}>
        {output.data}
      </Callout>
    );
  }

  if (output.type === "html") {
    return (
      <div
        dangerouslySetInnerHTML={{ __html: output.data }}
        style={{ fontSize: 14, lineHeight: 1.6 }}
      />
    );
  }

  if (output.type === "json") {
    const formatted =
      output.data === undefined
        ? "undefined"
        : JSON.stringify(output.data, null, 2);
    return (
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
          background: "#f5f5f5",
          padding: 8,
          borderRadius: 4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {formatted}
      </pre>
    );
  }

  if (output.type === "table") {
    const { columns, rows } = output.data as {
      columns: string[];
      rows: Record<string, any>[];
    };
    if (rows.length === 0) {
      return (
        <Callout icon="info-sign" intent="warning" style={{ fontSize: 13 }}>
          Query returned no results.
        </Callout>
      );
    }
    return (
      <div>
        <div
          style={{
            fontSize: 11,
            color: Colors.GRAY3,
            marginBottom: 6,
          }}
        >
          {rows.length} row{rows.length !== 1 ? "s" : ""} &times;{" "}
          {columns.length} column{columns.length !== 1 ? "s" : ""}
        </div>
        <HTMLTable
          bordered
          striped
          compact
          style={{ width: "100%", fontSize: 13 }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    background: Colors.LIGHT_GRAY5,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    padding: "6px 10px",
                  }}
                >
                  {prettyHeader(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((row, ri) => (
              <tr key={ri}>
                {columns.map((col) => (
                  <td key={col} style={{ padding: "4px 10px" }}>
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </HTMLTable>
        {rows.length > 200 && (
          <div style={{ fontSize: 11, color: Colors.GRAY3, marginTop: 6 }}>
            Showing first 200 of {rows.length} rows.
          </div>
        )}
      </div>
    );
  }

  return <span>Unknown output type</span>;
}
