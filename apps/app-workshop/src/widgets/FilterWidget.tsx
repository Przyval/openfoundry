import { useMemo, useState } from "react";
import { HTMLSelect, InputGroup } from "@blueprintjs/core";

interface FilterWidgetProps {
  config: Record<string, unknown>;
}

export function FilterWidget({ config }: FilterWidgetProps) {
  const label = (config.label as string) || "Filter";
  const filterType = (config.filterType as string) || "dropdown";
  const defaultValue = (config.defaultValue as string) || "";
  const [value, setValue] = useState(defaultValue);

  const options = useMemo<string[]>(() => {
    try {
      const raw = config.options;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [config.options]);

  return (
    <div className="filter-widget">
      <div className="filter-label">{label}</div>
      {filterType === "dropdown" ? (
        <HTMLSelect
          fill
          value={value}
          onChange={(e) => setValue(e.target.value)}
          options={options}
        />
      ) : (
        <InputGroup
          fill
          placeholder={`Filter by ${label}...`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
    </div>
  );
}
