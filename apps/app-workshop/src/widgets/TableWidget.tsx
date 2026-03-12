import { useMemo } from "react";
import { HTMLTable, NonIdealState } from "@blueprintjs/core";

interface TableColumn {
  key: string;
  label: string;
}

interface TableWidgetProps {
  config: Record<string, unknown>;
}

export function TableWidget({ config }: TableWidgetProps) {
  const title = (config.title as string) || "Table";

  const columns = useMemo<TableColumn[]>(() => {
    try {
      const raw = config.columns;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [config.columns]);

  const data = useMemo<Record<string, unknown>[]>(() => {
    try {
      const raw = config.data;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [config.data]);

  if (columns.length === 0) {
    return <NonIdealState icon="th" title="No columns configured" />;
  }

  return (
    <div style={{ overflow: "auto", height: "100%" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <HTMLTable bordered compact interactive striped style={{ width: "100%", fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col.key}>{row[col.key] != null ? String(row[col.key]) : ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </HTMLTable>
    </div>
  );
}
