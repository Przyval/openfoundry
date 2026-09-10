import { useMemo } from "react";
import { Card, Elevation, Spinner } from "@blueprintjs/core";
import { useAggregation } from "../../hooks/useObjectSetQuery";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChartWidgetProps {
  ontologyRid: string;
  objectType: string;
  chartType: "bar" | "line" | "pie";
  groupBy: string;
  aggregationType: string;
  property?: string;
  title: string;
}

const COLOR_PALETTE = [
  "#2965CC",
  "#0F9960",
  "#D9822B",
  "#DB3737",
  "#7157D9",
  "#FF6E4A",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChartWidget({
  ontologyRid,
  objectType,
  chartType,
  groupBy,
  aggregationType,
  property,
  title,
}: ChartWidgetProps) {
  const aggregation =
    aggregationType === "count"
      ? [{ type: "count" }]
      : [{ type: aggregationType, property: property ?? "" }];

  const { data, loading, error } = useAggregation({
    ontologyRid,
    objectType,
    aggregation,
    groupBy,
    enabled: !!ontologyRid && !!objectType && !!groupBy,
  });

  return (
    <Card elevation={Elevation.ONE} style={{ padding: 16 }}>
      <h4 style={{ margin: "0 0 12px" }}>{title}</h4>

      {loading ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spinner size={30} />
        </div>
      ) : error ? (
        <div style={{ color: "#DB3737", padding: 12 }}>{error}</div>
      ) : data.length === 0 ? (
        <div style={{ color: "#8A9BA8", padding: 12, textAlign: "center" }}>No data</div>
      ) : chartType === "bar" ? (
        <BarChart data={data} />
      ) : chartType === "pie" ? (
        <PieChart data={data} />
      ) : (
        <LineChart data={data} />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Bar Chart — horizontal bars with labels                            */
/* ------------------------------------------------------------------ */

function BarChart({ data }: { data: Array<{ group?: string; value: number }> }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 100,
              fontSize: 12,
              textAlign: "right",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "#5C7080",
              flexShrink: 0,
            }}
            title={d.group ?? "—"}
          >
            {d.group ?? "—"}
          </div>
          <div style={{ flex: 1, background: "#E1E8ED", borderRadius: 3, height: 20, position: "relative" }}>
            <div
              style={{
                width: `${(d.value / maxValue) * 100}%`,
                background: COLOR_PALETTE[i % COLOR_PALETTE.length],
                height: "100%",
                borderRadius: 3,
                minWidth: 2,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ width: 50, fontSize: 12, fontWeight: 600, color: "#394B59", flexShrink: 0 }}>
            {d.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pie Chart — CSS conic-gradient                                     */
/* ------------------------------------------------------------------ */

function PieChart({ data }: { data: Array<{ group?: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  const gradient = useMemo(() => {
    const segments: string[] = [];
    let cumPercent = 0;
    data.forEach((d, i) => {
      const pct = (d.value / total) * 100;
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      segments.push(`${color} ${cumPercent}% ${cumPercent + pct}%`);
      cumPercent += pct;
    });
    return `conic-gradient(${segments.join(", ")})`;
  }, [data, total]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: gradient,
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: COLOR_PALETTE[i % COLOR_PALETTE.length],
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#5C7080", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.group ?? "—"}
            </span>
            <span style={{ fontWeight: 600, color: "#394B59", marginLeft: "auto", flexShrink: 0 }}>
              {d.value.toLocaleString()} ({((d.value / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Line Chart — SVG polyline                                          */
/* ------------------------------------------------------------------ */

function LineChart({ data }: { data: Array<{ group?: string; value: number }> }) {
  const width = 400;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.map((d) => d.value), 0);
  const range = maxValue - minValue || 1;

  const points = data.map((d, i) => {
    const x = padding.left + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2);
    const y = padding.top + chartH - ((d.value - minValue) / range) * chartH;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: width }}>
      {/* Y-axis labels */}
      <text x={padding.left - 6} y={padding.top + 4} textAnchor="end" fontSize={10} fill="#8A9BA8">
        {maxValue.toLocaleString()}
      </text>
      <text x={padding.left - 6} y={padding.top + chartH + 4} textAnchor="end" fontSize={10} fill="#8A9BA8">
        {minValue.toLocaleString()}
      </text>

      {/* Grid line */}
      <line
        x1={padding.left}
        y1={padding.top + chartH}
        x2={padding.left + chartW}
        y2={padding.top + chartH}
        stroke="#E1E8ED"
        strokeWidth={1}
      />

      {/* Line */}
      <polyline
        fill="none"
        stroke={COLOR_PALETTE[0]}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(" ")}
      />

      {/* Data points */}
      {data.map((d, i) => {
        const x = padding.left + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2);
        const y = padding.top + chartH - ((d.value - minValue) / range) * chartH;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={3} fill={COLOR_PALETTE[0]} />
            {/* X-axis label */}
            <text
              x={x}
              y={height - 4}
              textAnchor="middle"
              fontSize={9}
              fill="#8A9BA8"
              style={{ overflow: "hidden" }}
            >
              {(d.group ?? "").slice(0, 8)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
