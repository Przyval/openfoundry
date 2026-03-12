import { Icon } from "@blueprintjs/core";

interface MetricWidgetProps {
  config: Record<string, unknown>;
}

export function MetricWidget({ config }: MetricWidgetProps) {
  const label = (config.label as string) || "Metric";
  const value = (config.value as string) || "0";
  const trend = (config.trend as string) || "";
  const trendDirection = (config.trendDirection as string) || "none";

  return (
    <div className="metric-widget">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {trend && (
        <div className={`metric-trend ${trendDirection}`}>
          {trendDirection === "up" && <Icon icon="trending-up" size={12} />}
          {trendDirection === "down" && <Icon icon="trending-down" size={12} />}
          {" "}{trend}
        </div>
      )}
    </div>
  );
}
