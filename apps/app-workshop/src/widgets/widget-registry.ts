/** Widget type identifiers */
export type WidgetType =
  | "TABLE"
  | "CHART"
  | "METRIC"
  | "TEXT"
  | "FILTER"
  | "BUTTON"
  | "IMAGE";

/** Position on the grid canvas */
export interface WidgetPosition {
  x: number; // grid column start (1-based)
  y: number; // grid row start (1-based)
  w: number; // width in grid columns
  h: number; // height in grid rows
}

/** A field definition in a config schema */
export interface ConfigField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "json" | "select";
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>; // for select type
}

/** Registry entry for a widget type */
export interface WidgetTypeDef {
  type: WidgetType;
  name: string;
  icon: string; // Blueprint icon name
  defaultConfig: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  configSchema: ConfigField[];
}

/** An instance of a widget placed on a page */
export interface WidgetInstance {
  id: string;
  type: WidgetType;
  config: Record<string, unknown>;
  position: WidgetPosition;
}

// ── Widget Type Definitions ──

const TABLE_DEF: WidgetTypeDef = {
  type: "TABLE",
  name: "Table",
  icon: "th",
  defaultSize: { w: 6, h: 4 },
  defaultConfig: {
    title: "Data Table",
    columns: JSON.stringify([
      { key: "name", label: "Name" },
      { key: "value", label: "Value" },
      { key: "status", label: "Status" },
    ]),
    data: JSON.stringify([
      { name: "Item A", value: "120", status: "Active" },
      { name: "Item B", value: "85", status: "Inactive" },
      { name: "Item C", value: "200", status: "Active" },
      { name: "Item D", value: "64", status: "Pending" },
    ]),
  },
  configSchema: [
    { key: "title", label: "Title", type: "string", defaultValue: "Data Table" },
    { key: "columns", label: "Columns (JSON)", type: "json", defaultValue: "[]" },
    { key: "data", label: "Data (JSON)", type: "json", defaultValue: "[]" },
  ],
};

const CHART_DEF: WidgetTypeDef = {
  type: "CHART",
  name: "Chart",
  icon: "chart",
  defaultSize: { w: 6, h: 4 },
  defaultConfig: {
    title: "Sales Overview",
    chartType: "bar",
    data: JSON.stringify([
      { label: "Jan", value: 120 },
      { label: "Feb", value: 180 },
      { label: "Mar", value: 95 },
      { label: "Apr", value: 210 },
      { label: "May", value: 160 },
      { label: "Jun", value: 240 },
    ]),
    color: "#2b95d6",
  },
  configSchema: [
    { key: "title", label: "Title", type: "string", defaultValue: "Chart" },
    {
      key: "chartType",
      label: "Chart Type",
      type: "select",
      defaultValue: "bar",
      options: [
        { label: "Bar", value: "bar" },
        { label: "Line", value: "line" },
      ],
    },
    { key: "data", label: "Data (JSON)", type: "json", defaultValue: "[]" },
    { key: "color", label: "Color", type: "string", defaultValue: "#2b95d6" },
  ],
};

const METRIC_DEF: WidgetTypeDef = {
  type: "METRIC",
  name: "Metric",
  icon: "numerical",
  defaultSize: { w: 3, h: 2 },
  defaultConfig: {
    label: "Revenue",
    value: "$1.24M",
    trend: "+12%",
    trendDirection: "up",
  },
  configSchema: [
    { key: "label", label: "Label", type: "string", defaultValue: "Metric" },
    { key: "value", label: "Value", type: "string", defaultValue: "0" },
    { key: "trend", label: "Trend Text", type: "string", defaultValue: "" },
    {
      key: "trendDirection",
      label: "Trend Direction",
      type: "select",
      defaultValue: "up",
      options: [
        { label: "Up", value: "up" },
        { label: "Down", value: "down" },
        { label: "None", value: "none" },
      ],
    },
  ],
};

const TEXT_DEF: WidgetTypeDef = {
  type: "TEXT",
  name: "Text",
  icon: "align-left",
  defaultSize: { w: 4, h: 2 },
  defaultConfig: {
    content: "<h2>Welcome</h2><p>This is a text widget. Edit the HTML content in the config panel.</p>",
  },
  configSchema: [
    { key: "content", label: "HTML Content", type: "json", defaultValue: "<p>Text here</p>" },
  ],
};

const FILTER_DEF: WidgetTypeDef = {
  type: "FILTER",
  name: "Filter",
  icon: "filter",
  defaultSize: { w: 3, h: 2 },
  defaultConfig: {
    label: "Status Filter",
    filterType: "dropdown",
    options: JSON.stringify(["All", "Active", "Inactive", "Pending"]),
    defaultValue: "All",
  },
  configSchema: [
    { key: "label", label: "Label", type: "string", defaultValue: "Filter" },
    {
      key: "filterType",
      label: "Filter Type",
      type: "select",
      defaultValue: "dropdown",
      options: [
        { label: "Dropdown", value: "dropdown" },
        { label: "Text Input", value: "text" },
      ],
    },
    { key: "options", label: "Options (JSON array)", type: "json", defaultValue: "[]" },
    { key: "defaultValue", label: "Default Value", type: "string", defaultValue: "" },
  ],
};

const BUTTON_DEF: WidgetTypeDef = {
  type: "BUTTON",
  name: "Button",
  icon: "widget-button",
  defaultSize: { w: 2, h: 1 },
  defaultConfig: {
    text: "Run Action",
    intent: "primary",
    icon: "play",
    action: "none",
    navigateTo: "",
  },
  configSchema: [
    { key: "text", label: "Button Text", type: "string", defaultValue: "Click Me" },
    {
      key: "intent",
      label: "Intent",
      type: "select",
      defaultValue: "primary",
      options: [
        { label: "Primary", value: "primary" },
        { label: "Success", value: "success" },
        { label: "Warning", value: "warning" },
        { label: "Danger", value: "danger" },
        { label: "None", value: "none" },
      ],
    },
    { key: "icon", label: "Icon Name", type: "string", defaultValue: "" },
    {
      key: "action",
      label: "Action",
      type: "select",
      defaultValue: "none",
      options: [
        { label: "None", value: "none" },
        { label: "Navigate", value: "navigate" },
        { label: "Alert", value: "alert" },
      ],
    },
    { key: "navigateTo", label: "Navigate URL", type: "string", defaultValue: "" },
  ],
};

const IMAGE_DEF: WidgetTypeDef = {
  type: "IMAGE",
  name: "Image",
  icon: "media",
  defaultSize: { w: 4, h: 3 },
  defaultConfig: {
    src: "https://via.placeholder.com/400x200?text=Image+Widget",
    alt: "Placeholder image",
    objectFit: "cover",
  },
  configSchema: [
    { key: "src", label: "Image URL", type: "string", defaultValue: "" },
    { key: "alt", label: "Alt Text", type: "string", defaultValue: "" },
    {
      key: "objectFit",
      label: "Object Fit",
      type: "select",
      defaultValue: "cover",
      options: [
        { label: "Cover", value: "cover" },
        { label: "Contain", value: "contain" },
        { label: "Fill", value: "fill" },
      ],
    },
  ],
};

/** All widget type definitions */
export const WIDGET_TYPES: WidgetTypeDef[] = [
  TABLE_DEF,
  CHART_DEF,
  METRIC_DEF,
  TEXT_DEF,
  FILTER_DEF,
  BUTTON_DEF,
  IMAGE_DEF,
];

/** Lookup a widget type definition by type */
export function getWidgetDef(type: WidgetType): WidgetTypeDef | undefined {
  return WIDGET_TYPES.find((w) => w.type === type);
}

/** Generate a unique ID */
export function generateId(): string {
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a new widget instance with defaults */
export function createWidgetInstance(
  type: WidgetType,
  positionOverride?: Partial<WidgetPosition>,
): WidgetInstance {
  const def = getWidgetDef(type);
  if (!def) throw new Error(`Unknown widget type: ${type}`);
  return {
    id: generateId(),
    type,
    config: { ...def.defaultConfig },
    position: {
      x: positionOverride?.x ?? 1,
      y: positionOverride?.y ?? 1,
      w: positionOverride?.w ?? def.defaultSize.w,
      h: positionOverride?.h ?? def.defaultSize.h,
    },
  };
}
