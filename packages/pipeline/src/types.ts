// ---------------------------------------------------------------------------
// Pipeline domain types
// ---------------------------------------------------------------------------

export interface PipelineDefinition {
  rid: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  schedule?: PipelineSchedule;
  inputDatasets: string[]; // dataset RIDs
  outputDataset: string; // target dataset RID
  status: PipelineStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type PipelineStatus = "ACTIVE" | "PAUSED" | "ERROR";

export interface PipelineStep {
  id: string;
  name: string;
  type: PipelineStepType;
  config: Record<string, unknown>;
  dependsOn?: string[]; // step IDs this step depends on
}

export type PipelineStepType =
  | "FILTER"
  | "MAP"
  | "AGGREGATE"
  | "JOIN"
  | "SORT"
  | "DEDUPLICATE"
  | "CUSTOM";

export interface PipelineSchedule {
  type: "MANUAL" | "INTERVAL" | "CRON" | "ON_UPDATE";
  interval?: number; // ms
  cron?: string;
}

export interface PipelineRun {
  rid: string;
  pipelineRid: string;
  status: PipelineRunStatus;
  startedAt: Date;
  completedAt?: Date;
  stepResults: StepResult[];
  rowsProcessed: number;
  error?: string;
}

export type PipelineRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export interface StepResult {
  stepId: string;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  rowsIn: number;
  rowsOut: number;
  durationMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Step configuration shapes
// ---------------------------------------------------------------------------

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "in";

export interface FilterConfig {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface MapMapping {
  source: string;
  target: string;
  transform?: "uppercase" | "lowercase" | "trim" | "toNumber" | "toDate";
}

export interface MapConfig {
  mappings: MapMapping[];
}

export interface AggregationDef {
  field: string;
  function: "count" | "sum" | "avg" | "min" | "max";
  alias: string;
}

export interface AggregateConfig {
  groupBy: string[];
  aggregations: AggregationDef[];
}

export interface JoinConfig {
  joinType: "inner" | "left" | "right";
  leftKey: string;
  rightKey: string;
}

export interface SortField {
  field: string;
  direction: "asc" | "desc";
}

export interface SortConfig {
  fields: SortField[];
}

export interface DeduplicateConfig {
  keys: string[];
}

export interface CustomConfig {
  expression: string;
}
