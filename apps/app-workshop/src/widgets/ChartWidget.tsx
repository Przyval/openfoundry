import { useMemo } from "react";

interface ChartDataPoint {
  label: string;
  value: number;
}

interface ChartWidgetProps {
  config: Record<string, unknown>;
}

export function ChartWidget({ config }: ChartWidgetProps) {
  const title = (config.title as string) || "";
  const chartType = (config.chartType as string) || "bar";
  const color = (config.color as string) || "#2b95d6";

  const data = useMemo<ChartDataPoint[]>(() => {
    try {
      const raw = config.data;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [config.data]);

  const maxValue = useMemo(() => {
    if (data.length === 0) return 1;
    return Math.max(...data.map((d) => d.value), 1);
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="chart-widget">
        <div className="chart-title">{title}</div>
        <div style={{ color: "#8a9ba8", fontSize: 13, textAlign: "center", padding: 16 }}>
          No data configured
        </div>
      </div>
    );
  }

  if (chartType === "line") {
    // Simple line chart using SVG
    const padding = 8;
    const height = 120;
    const width = data.length * 50;
    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - (d.value / maxValue) * (height - 2 * padding);
      return { x, y, ...d };
    });
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    return (
      <div className="chart-widget">
        {title && <div className="chart-title">{title}</div>}
        <svg viewBox={`0 0 ${width} ${height + 20}`} style={{ width: "100%", flex: 1 }}>
          <path d={pathD} fill="none" stroke={color} strokeWidth={2} />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={4} fill={color} />
              <text
                x={p.x}
                y={height + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#5c7080"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  // Bar chart (default)
  return (
    <div className="chart-widget">
      {title && <div className="chart-title">{title}</div>}
      <div className="chart-bars">
        {data.map((d, i) => (
          <div className="chart-bar-group" key={i}>
            <div
              className="chart-bar"
              style={{
                height: `${(d.value / maxValue) * 100}%`,
                background: color,
              }}
              title={`${d.label}: ${d.value}`}
            />
            <div className="chart-bar-label">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
