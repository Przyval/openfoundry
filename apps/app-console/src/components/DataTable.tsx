import { HTMLTable, NonIdealState } from "@blueprintjs/core";
import { type ReactNode, useCallback, useState } from "react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data available",
  selectable = false,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = useCallback(
    (key: string) => {
      if (sortCol === key) {
        setSortAsc((a) => !a);
      } else {
        setSortCol(key);
        setSortAsc(true);
      }
    },
    [sortCol],
  );

  const toggleRow = useCallback(
    (key: string) => {
      if (!onSelectionChange || !selectedKeys) return;
      const next = new Set(selectedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onSelectionChange(next);
    },
    [onSelectionChange, selectedKeys],
  );

  if (rows.length === 0) {
    return <NonIdealState icon="search" title={emptyMessage} />;
  }

  return (
    <HTMLTable bordered compact striped interactive style={{ width: "100%" }}>
      <thead>
        <tr>
          {selectable && <th style={{ width: 40 }} />}
          {columns.map((col) => (
            <th
              key={col.key}
              onClick={col.sortable ? () => handleSort(col.key) : undefined}
              style={col.sortable ? { cursor: "pointer", userSelect: "none" } : undefined}
            >
              {col.header}
              {sortCol === col.key && (sortAsc ? " \u25B2" : " \u25BC")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <tr key={key}>
              {selectable && (
                <td>
                  <input
                    type="checkbox"
                    checked={selectedKeys?.has(key) ?? false}
                    onChange={() => toggleRow(key)}
                  />
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key}>{col.render(row)}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </HTMLTable>
  );
}
