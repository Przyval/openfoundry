import { Card, Elevation, Spinner } from "@blueprintjs/core";
import { useAggregation } from "../../hooks/useObjectSetQuery";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface KPICardWidgetProps {
  ontologyRid: string;
  objectType: string;
  aggregationType: "count" | "avg" | "sum" | "min" | "max";
  property?: string;
  title: string;
  color?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function KPICardWidget({
  ontologyRid,
  objectType,
  aggregationType,
  property,
  title,
  color = "#2965CC",
}: KPICardWidgetProps) {
  const aggregation =
    aggregationType === "count"
      ? [{ type: "count" }]
      : [{ type: aggregationType, property: property ?? "" }];

  const { data, loading, error } = useAggregation({
    ontologyRid,
    objectType,
    aggregation,
    enabled: !!ontologyRid && !!objectType,
  });

  const value = data.length > 0 ? data[0].value : null;

  return (
    <Card elevation={Elevation.TWO} style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "#8A9BA8", marginBottom: 8, fontWeight: 500 }}>
        {title}
      </div>

      {loading ? (
        <Spinner size={30} />
      ) : error ? (
        <div style={{ color: "#DB3737", fontSize: 13 }}>{error}</div>
      ) : (
        <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1.1 }}>
          {value !== null ? value.toLocaleString() : "—"}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#A7B6C2", marginTop: 6 }}>
        {aggregationType.toUpperCase()}
        {property ? ` of ${property}` : ""} &middot; {objectType}
      </div>
    </Card>
  );
}
