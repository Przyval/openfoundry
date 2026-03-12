import { useState, useMemo, useCallback } from "react";
import {
  HTMLTable,
  Checkbox,
  Spinner,
  NonIdealState,
  Icon,
} from "@blueprintjs/core";

export interface ObjectTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

export interface ObjectTableProps {
  columns: ObjectTableColumn[];
  data: Array<Record<string, unknown>>;
  onRowClick?: (row: Record<string, unknown>) => void;
  loading?: boolean;
  emptyMessage?: string;
  selectedRows?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  primaryKeyField?: string;
}

type SortDirection = "asc" | "desc";

interface SortState {
  column: string;
  direction: SortDirection;
}

export function ObjectTable({
  columns,
  data,
  onRowClick,
  loading = false,
  emptyMessage = "No data available",
  selectedRows,
  onSelectionChange,
  primaryKeyField = "id",
}: ObjectTableProps): JSX.Element {
  const [sort, setSort] = useState<SortState | null>(null);

  const handleSort = useCallback(
    (columnKey: string) => {
      setSort((prev) => {
        if (prev?.column === columnKey) {
          return prev.direction === "asc"
            ? { column: columnKey, direction: "desc" }
            : null;
        }
        return { column: columnKey, direction: "asc" };
      });
    },
    [],
  );

  const sortedData = useMemo(() => {
    if (!sort) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sort.column];
      const bVal = b[sort.column];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, {
        numeric: true,
      });
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [data, sort]);

  const handleRowSelect = useCallback(
    (key: string) => {
      if (!selectedRows || !onSelectionChange) return;
      const next = new Set(selectedRows);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onSelectionChange(next);
    },
    [selectedRows, onSelectionChange],
  );

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (selectedRows && selectedRows.size === data.length) {
      onSelectionChange(new Set());
    } else {
      const allKeys = new Set(
        data.map((row) => String(row[primaryKeyField] ?? "")),
      );
      onSelectionChange(allKeys);
    }
  }, [data, selectedRows, onSelectionChange, primaryKeyField]);

  if (loading) {
    return (
      <NonIdealState icon={<Spinner />} title="Loading..." />
    );
  }

  if (data.length === 0) {
    return (
      <NonIdealState icon="search" title={emptyMessage} />
    );
  }

  const selectable = selectedRows !== undefined && onSelectionChange !== undefined;
  const allSelected = selectable && selectedRows!.size === data.length && data.length > 0;

  return (
    <HTMLTable bordered compact interactive striped style={{ width: "100%" }}>
      <thead>
        <tr>
          {selectable && (
            <th style={{ width: 40 }}>
              <Checkbox
                checked={allSelected}
                indeterminate={
                  selectedRows!.size > 0 && selectedRows!.size < data.length
                }
                onChange={handleSelectAll}
              />
            </th>
          )}
          {columns.map((col) => (
            <th
              key={col.key}
              onClick={col.sortable ? () => handleSort(col.key) : undefined}
              style={col.sortable ? { cursor: "pointer", userSelect: "none" } : undefined}
            >
              {col.label}
              {sort?.column === col.key && (
                <>
                  {" "}
                  <Icon
                    icon={sort.direction === "asc" ? "sort-asc" : "sort-desc"}
                    size={12}
                  />
                </>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedData.map((row, idx) => {
          const rowKey = String(row[primaryKeyField] ?? idx);
          const isSelected = selectable && selectedRows!.has(rowKey);
          return (
            <tr
              key={rowKey}
              onClick={() => onRowClick?.(row)}
              style={onRowClick ? { cursor: "pointer" } : undefined}
              className={isSelected ? "bp5-intent-primary" : undefined}
            >
              {selectable && (
                <td>
                  <Checkbox
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleRowSelect(rowKey);
                    }}
                  />
                </td>
              )}
              {columns.map((col) => (
                <td key={col.key}>
                  {row[col.key] != null ? String(row[col.key]) : ""}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </HTMLTable>
  );
}
