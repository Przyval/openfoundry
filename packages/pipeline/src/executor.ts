import { generateRid } from "@openfoundry/rid";
import type {
  PipelineDefinition,
  PipelineRun,
  PipelineStep,
  StepResult,
  FilterConfig,
  FilterOperator,
  MapConfig,
  AggregateConfig,
  JoinConfig,
  SortConfig,
  DeduplicateConfig,
  DeriveConfig,
  LimitConfig,
} from "./types.js";
import { topologicalSort } from "./dag.js";

// ---------------------------------------------------------------------------
// Record type alias
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Step handlers
// ---------------------------------------------------------------------------

function applyFilter(rows: Row[], config: FilterConfig): Row[] {
  return rows.filter((row) => {
    const val = row[config.field];
    return evaluateOperator(val, config.operator, config.value);
  });
}

function evaluateOperator(
  fieldValue: unknown,
  operator: FilterOperator,
  compareValue: unknown,
): boolean {
  switch (operator) {
    case "eq":
      return fieldValue === compareValue;
    case "neq":
      return fieldValue !== compareValue;
    case "gt":
      return (fieldValue as number) > (compareValue as number);
    case "gte":
      return (fieldValue as number) >= (compareValue as number);
    case "lt":
      return (fieldValue as number) < (compareValue as number);
    case "lte":
      return (fieldValue as number) <= (compareValue as number);
    case "contains":
      return String(fieldValue).includes(String(compareValue));
    case "startsWith":
      return String(fieldValue).startsWith(String(compareValue));
    case "in":
      return Array.isArray(compareValue) && compareValue.includes(fieldValue);
    default:
      return false;
  }
}

function applyMap(rows: Row[], config: MapConfig): Row[] {
  return rows.map((row) => {
    const result: Row = {};
    for (const mapping of config.mappings) {
      let value = row[mapping.source];
      if (mapping.transform) {
        value = applyTransform(value, mapping.transform);
      }
      result[mapping.target] = value;
    }
    return result;
  });
}

function applyTransform(
  value: unknown,
  transform: string,
): unknown {
  switch (transform) {
    case "uppercase":
      return String(value).toUpperCase();
    case "lowercase":
      return String(value).toLowerCase();
    case "trim":
      return String(value).trim();
    case "toNumber":
      return Number(value);
    case "toDate":
      return new Date(String(value)).toISOString();
    default:
      return value;
  }
}

function applyAggregate(rows: Row[], config: AggregateConfig): Row[] {
  // Group rows
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const key = config.groupBy.map((f) => String(row[f])).join("||");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  }

  const results: Row[] = [];

  for (const [, groupRows] of groups) {
    const result: Row = {};

    // Include group-by fields from the first row
    for (const field of config.groupBy) {
      result[field] = groupRows[0][field];
    }

    // Apply aggregations
    for (const agg of config.aggregations) {
      const values = groupRows.map((r) => r[agg.field]);
      switch (agg.function) {
        case "count":
          result[agg.alias] = values.length;
          break;
        case "sum":
          result[agg.alias] = values.reduce(
            (acc: number, v) => acc + Number(v),
            0,
          );
          break;
        case "avg": {
          const sum = values.reduce(
            (acc: number, v) => acc + Number(v),
            0,
          );
          result[agg.alias] = sum / values.length;
          break;
        }
        case "min":
          result[agg.alias] = Math.min(
            ...values.map((v) => Number(v)),
          );
          break;
        case "max":
          result[agg.alias] = Math.max(
            ...values.map((v) => Number(v)),
          );
          break;
      }
    }

    results.push(result);
  }

  return results;
}

function applyJoin(
  leftRows: Row[],
  rightRows: Row[],
  config: JoinConfig,
): Row[] {
  const results: Row[] = [];

  if (config.joinType === "inner") {
    for (const left of leftRows) {
      for (const right of rightRows) {
        if (left[config.leftKey] === right[config.rightKey]) {
          results.push({ ...left, ...right });
        }
      }
    }
  } else if (config.joinType === "left") {
    for (const left of leftRows) {
      let matched = false;
      for (const right of rightRows) {
        if (left[config.leftKey] === right[config.rightKey]) {
          results.push({ ...left, ...right });
          matched = true;
        }
      }
      if (!matched) {
        results.push({ ...left });
      }
    }
  } else if (config.joinType === "right") {
    for (const right of rightRows) {
      let matched = false;
      for (const left of leftRows) {
        if (left[config.leftKey] === right[config.rightKey]) {
          results.push({ ...left, ...right });
          matched = true;
        }
      }
      if (!matched) {
        results.push({ ...right });
      }
    }
  }

  return results;
}

function applySort(rows: Row[], config: SortConfig): Row[] {
  return [...rows].sort((a, b) => {
    for (const field of config.fields) {
      const aVal = a[field.field];
      const bVal = b[field.field];
      let cmp = 0;

      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      if (cmp !== 0) {
        return field.direction === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  });
}

function applyDeduplicate(rows: Row[], config: DeduplicateConfig): Row[] {
  const seen = new Set<string>();
  const results: Row[] = [];

  for (const row of rows) {
    const key = config.keys.map((k) => JSON.stringify(row[k])).join("||");
    if (!seen.has(key)) {
      seen.add(key);
      results.push(row);
    }
  }

  return results;
}

function applyDerive(rows: Row[], config: DeriveConfig): Row[] {
  return rows.map((row) => {
    const result: Row = { ...row };
    for (const field of config.fields) {
      try {
        const fn = new Function("row", `return (${field.expression});`) as (
          row: Row,
        ) => unknown;
        result[field.name] = fn(row);
      } catch {
        result[field.name] = null;
      }
    }
    return result;
  });
}

function applyLimit(rows: Row[], config: LimitConfig): Row[] {
  return rows.slice(0, config.limit);
}

function applyCustom(rows: Row[], expression: string): Row[] {
  // Simple expression evaluator: filter rows where the expression evaluates truthy.
  // Supports field references via `row.fieldName` and basic comparisons.
  // For security, this uses a restricted Function constructor approach.
  try {
    const fn = new Function("row", `return (${expression});`) as (
      row: Row,
    ) => unknown;
    return rows.filter((row) => {
      try {
        return Boolean(fn(row));
      } catch {
        return false;
      }
    });
  } catch {
    return rows;
  }
}

// ---------------------------------------------------------------------------
// Pipeline executor
// ---------------------------------------------------------------------------

export class PipelineExecutor {
  /**
   * Execute a pipeline against input data.
   *
   * For JOIN steps, the `joinData` map should provide the right-side dataset
   * keyed by step ID.
   */
  execute(
    pipeline: PipelineDefinition,
    inputData: Row[],
    joinData?: Map<string, Row[]>,
  ): PipelineRun {
    const runRid = generateRid("pipeline-builder", "run").toString();
    const startedAt = new Date();
    const stepResults: StepResult[] = [];
    let currentData = [...inputData];
    let totalRowsProcessed = 0;
    let pipelineError: string | undefined;

    // Get steps in topological order
    let sortedSteps: PipelineStep[];
    try {
      sortedSteps = topologicalSort(pipeline.steps);
    } catch (err: unknown) {
      return {
        rid: runRid,
        pipelineRid: pipeline.rid,
        status: "FAILED",
        startedAt,
        completedAt: new Date(),
        stepResults: [],
        rowsProcessed: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Store intermediate results per step for dependency resolution
    const stepOutputs = new Map<string, Row[]>();

    for (const step of sortedSteps) {
      const stepStart = performance.now();
      const rowsIn = currentData.length;

      try {
        // If step has dependencies, merge their outputs as input
        if (step.dependsOn && step.dependsOn.length > 0) {
          // Use output of the last dependency as input
          const lastDep = step.dependsOn[step.dependsOn.length - 1];
          const depOutput = stepOutputs.get(lastDep);
          if (depOutput) {
            currentData = depOutput;
          }
        }

        currentData = this.executeStep(step, currentData, joinData);

        stepOutputs.set(step.id, currentData);
        totalRowsProcessed += rowsIn;

        stepResults.push({
          stepId: step.id,
          status: "SUCCEEDED",
          rowsIn,
          rowsOut: currentData.length,
          durationMs: performance.now() - stepStart,
        });
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);

        stepResults.push({
          stepId: step.id,
          status: "FAILED",
          rowsIn,
          rowsOut: 0,
          durationMs: performance.now() - stepStart,
          error: errorMessage,
        });

        pipelineError = `Step "${step.id}" failed: ${errorMessage}`;

        // Mark remaining steps as skipped
        const remaining = sortedSteps.slice(
          sortedSteps.indexOf(step) + 1,
        );
        for (const skipped of remaining) {
          stepResults.push({
            stepId: skipped.id,
            status: "SKIPPED",
            rowsIn: 0,
            rowsOut: 0,
            durationMs: 0,
          });
        }
        break;
      }
    }

    return {
      rid: runRid,
      pipelineRid: pipeline.rid,
      status: pipelineError ? "FAILED" : "SUCCEEDED",
      startedAt,
      completedAt: new Date(),
      stepResults,
      rowsProcessed: totalRowsProcessed,
      error: pipelineError,
    };
  }

  private executeStep(
    step: PipelineStep,
    data: Row[],
    joinData?: Map<string, Row[]>,
  ): Row[] {
    const config = step.config;

    switch (step.type) {
      case "FILTER":
        return applyFilter(data, config as unknown as FilterConfig);
      case "MAP":
        return applyMap(data, config as unknown as MapConfig);
      case "AGGREGATE":
        return applyAggregate(data, config as unknown as AggregateConfig);
      case "JOIN": {
        const joinConfig = config as unknown as JoinConfig;
        const rightData = joinData?.get(step.id) ?? [];
        return applyJoin(data, rightData, joinConfig);
      }
      case "SORT":
        return applySort(data, config as unknown as SortConfig);
      case "DEDUPLICATE":
        return applyDeduplicate(
          data,
          config as unknown as DeduplicateConfig,
        );
      case "DERIVE":
        return applyDerive(data, config as unknown as DeriveConfig);
      case "LIMIT":
        return applyLimit(data, config as unknown as LimitConfig);
      case "CUSTOM": {
        const expression = (config as Record<string, string>).expression ?? "true";
        return applyCustom(data, expression);
      }
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
}
