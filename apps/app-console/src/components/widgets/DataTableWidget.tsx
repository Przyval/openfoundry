import { useState } from "react";
import { Button, Card, Elevation, HTMLTable, Spinner } from "@blueprintjs/core";
import { useObjectSetQuery } from "../../hooks/useObjectSetQuery";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DataTableWidgetProps {
  ontologyRid: string;
  objectType: string;
  columns: string[];
  pageSize?: number;
  title: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DataTableWidget({
  ontologyRid,
  objectType,
  columns,
  pageSize = 10,
  title,
}: DataTableWidgetProps) {
  const [page, setPage] = useState(0);

  const { data, loading, error } = useObjectSetQuery<Record<string, unknown>>({
    ontologyRid,
    objectType,
    pageSize: 500, // fetch all, paginate client-side
    enabled: !!ontologyRid && !!objectType,
  });

  // Auto-detect columns from first row if not specified
  const effectiveColumns =
    columns.length > 0
      ? columns
      : data.length > 0
        ? Object.keys(data[0])
        : [];

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = data.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <Card elevation={Elevation.ONE} style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <span style={{ fontSize: 12, color: "#8A9BA8" }}>
          {data.length} row{data.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spinner size={30} />
        </div>
      ) : error ? (
        <div style={{ color: "#DB3737", padding: 12 }}>{error}</div>
      ) : data.length === 0 ? (
        <div style={{ color: "#8A9BA8", padding: 12, textAlign: "center" }}>No data</div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <HTMLTable compact striped style={{ width: "100%" }}>
              <thead>
                <tr>
                  {effectiveColumns.map((col) => (
                    <th key={col} style={{ whiteSpace: "nowrap" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, idx) => (
                  <tr key={idx}>
                    {effectiveColumns.map((col) => (
                      <td key={col} style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {formatCell(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12 }}>
              <Button
                small
                icon="chevron-left"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              />
              <span style={{ fontSize: 12, color: "#8A9BA8" }}>
                Page {safePage + 1} of {totalPages}
              </span>
              <Button
                small
                icon="chevron-right"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
