import type { WidgetType } from "./widget-registry";
import { TableWidget } from "./TableWidget";
import { ChartWidget } from "./ChartWidget";
import { MetricWidget } from "./MetricWidget";
import { TextWidget } from "./TextWidget";
import { FilterWidget } from "./FilterWidget";
import { ButtonWidget } from "./ButtonWidget";
import { ImageWidget } from "./ImageWidget";

interface WidgetRendererProps {
  type: WidgetType;
  config: Record<string, unknown>;
}

/** Renders the correct widget component based on type */
export function WidgetRenderer({ type, config }: WidgetRendererProps) {
  switch (type) {
    case "TABLE":
      return <TableWidget config={config} />;
    case "CHART":
      return <ChartWidget config={config} />;
    case "METRIC":
      return <MetricWidget config={config} />;
    case "TEXT":
      return <TextWidget config={config} />;
    case "FILTER":
      return <FilterWidget config={config} />;
    case "BUTTON":
      return <ButtonWidget config={config} />;
    case "IMAGE":
      return <ImageWidget config={config} />;
    default:
      return <div>Unknown widget type: {type}</div>;
  }
}
