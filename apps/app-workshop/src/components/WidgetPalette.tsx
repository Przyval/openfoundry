import { Icon } from "@blueprintjs/core";
import { WIDGET_TYPES, type WidgetType } from "../widgets/widget-registry";
import type { IconName } from "@blueprintjs/icons";

interface WidgetPaletteProps {
  onAddWidget: (type: WidgetType) => void;
}

export function WidgetPalette({ onAddWidget }: WidgetPaletteProps) {
  return (
    <div className="widget-palette">
      <h4>Widgets</h4>
      {WIDGET_TYPES.map((def) => (
        <button
          key={def.type}
          className="widget-palette-item"
          onClick={() => onAddWidget(def.type)}
          title={`Add ${def.name} widget`}
        >
          <Icon icon={def.icon as IconName} size={16} />
          <span>{def.name}</span>
        </button>
      ))}
    </div>
  );
}
