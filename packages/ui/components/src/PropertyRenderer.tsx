import { Icon } from "@blueprintjs/core";

export interface PropertyRendererProps {
  value: unknown;
  type: string;
}

function formatNumber(value: unknown): string {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString();
}

function formatDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString();
    }
  }
  return String(value);
}

export function PropertyRenderer({
  value,
  type,
}: PropertyRendererProps): JSX.Element {
  if (value == null) {
    return <span className="bp5-text-muted">--</span>;
  }

  switch (type) {
    case "BOOLEAN":
      return (
        <Icon
          icon={value ? "tick" : "cross"}
          intent={value ? "success" : "none"}
        />
      );

    case "INTEGER":
      return <span>{formatNumber(value)}</span>;

    case "DOUBLE":
      return (
        <span>
          {typeof value === "number"
            ? value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6,
              })
            : formatNumber(value)}
        </span>
      );

    case "DATETIME":
    case "TIMESTAMP":
    case "DATE":
      return <span>{formatDate(value)}</span>;

    case "STRING":
    default:
      return <span>{String(value)}</span>;
  }
}
