import { useCallback } from "react";
import {
  Button,
  InputGroup,
  Tag,
  HTMLSelect,
  ButtonGroup,
} from "@blueprintjs/core";

export interface FilterProperty {
  apiName: string;
  displayName: string;
  type: string;
}

export interface Filter {
  property: string;
  operator: string;
  value: string;
}

export interface FilterBarProps {
  properties: FilterProperty[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
}

const OPERATORS_BY_TYPE: Record<string, Array<{ value: string; label: string }>> = {
  STRING: [
    { value: "eq", label: "equals" },
    { value: "neq", label: "not equals" },
    { value: "contains", label: "contains" },
    { value: "startsWith", label: "starts with" },
  ],
  INTEGER: [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
  ],
  DOUBLE: [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
  ],
  BOOLEAN: [
    { value: "eq", label: "equals" },
  ],
  DATETIME: [
    { value: "eq", label: "equals" },
    { value: "gt", label: "after" },
    { value: "lt", label: "before" },
  ],
};

function getOperators(type: string): Array<{ value: string; label: string }> {
  return OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE["STRING"]!;
}

export function FilterBar({
  properties,
  filters,
  onFiltersChange,
}: FilterBarProps): JSX.Element {
  const addFilter = useCallback(() => {
    const firstProp = properties[0];
    if (!firstProp) return;
    const operators = getOperators(firstProp.type);
    onFiltersChange([
      ...filters,
      { property: firstProp.apiName, operator: operators[0]!.value, value: "" },
    ]);
  }, [properties, filters, onFiltersChange]);

  const updateFilter = useCallback(
    (index: number, patch: Partial<Filter>) => {
      const updated = filters.map((f, i) => (i === index ? { ...f, ...patch } : f));
      onFiltersChange(updated);
    },
    [filters, onFiltersChange],
  );

  const removeFilter = useCallback(
    (index: number) => {
      onFiltersChange(filters.filter((_, i) => i !== index));
    },
    [filters, onFiltersChange],
  );

  return (
    <div className="of-filter-bar" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {filters.map((filter, index) => {
        const prop = properties.find((p) => p.apiName === filter.property);
        const operators = getOperators(prop?.type ?? "STRING");

        return (
          <div
            key={index}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <HTMLSelect
              value={filter.property}
              onChange={(e) =>
                updateFilter(index, { property: e.currentTarget.value })
              }
            >
              {properties.map((p) => (
                <option key={p.apiName} value={p.apiName}>
                  {p.displayName}
                </option>
              ))}
            </HTMLSelect>

            <HTMLSelect
              value={filter.operator}
              onChange={(e) =>
                updateFilter(index, { operator: e.currentTarget.value })
              }
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </HTMLSelect>

            <InputGroup
              value={filter.value}
              placeholder="Value..."
              onChange={(e) =>
                updateFilter(index, { value: e.currentTarget.value })
              }
              small
            />

            <Button
              icon="cross"
              minimal
              small
              onClick={() => removeFilter(index)}
              aria-label="Remove filter"
            />
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Button icon="plus" text="Add filter" minimal small onClick={addFilter} />
        {filters.length > 0 && (
          <ButtonGroup>
            <Tag minimal>
              {filters.length} filter{filters.length !== 1 ? "s" : ""} active
            </Tag>
            <Button
              icon="cross"
              minimal
              small
              onClick={() => onFiltersChange([])}
              aria-label="Clear all filters"
            />
          </ButtonGroup>
        )}
      </div>
    </div>
  );
}
