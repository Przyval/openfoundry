import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Collapse,
  Elevation,
  HTMLTable,
  InputGroup,
  NonIdealState,
  Spinner,
  Tag,
  Intent,
  Icon,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PipelineStep {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  dependsOn?: string[];
}

interface Pipeline {
  rid: string;
  name: string;
  description?: string;
  steps: PipelineStep[];
  schedule?: { type: string; interval?: number; cron?: string };
  inputDatasets: string[];
  outputDataset: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PipelineListResponse {
  data: Pipeline[];
}

interface StepResult {
  stepId: string;
  status: string;
  rowsIn: number;
  rowsOut: number;
  durationMs: number;
  error?: string;
}

interface PipelineRun {
  rid: string;
  pipelineRid: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  stepResults: StepResult[];
  rowsProcessed: number;
  error?: string | null;
}

interface RunListResponse {
  data: PipelineRun[];
}

/** The execute endpoint returns run info plus the actual transformed data. */
interface ExecuteResult extends PipelineRun {
  resultData: Record<string, unknown>[];
  resultColumns: string[];
  sourceRowCount: number;
  outputRowCount: number;
  executionMs: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusIntent(status: string): Intent {
  switch (status) {
    case "ACTIVE":
    case "SUCCEEDED":
      return Intent.SUCCESS;
    case "RUNNING":
    case "QUEUED":
      return Intent.PRIMARY;
    case "PAUSED":
    case "CANCELLED":
      return Intent.WARNING;
    case "ERROR":
    case "FAILED":
      return Intent.DANGER;
    default:
      return Intent.NONE;
  }
}

function stepTypeIcon(type: string): string {
  switch (type) {
    case "FILTER":
      return "filter";
    case "MAP":
      return "map";
    case "AGGREGATE":
      return "grouped-bar-chart";
    case "JOIN":
      return "join-table";
    case "SORT":
      return "sort";
    case "DEDUPLICATE":
      return "duplicate";
    case "DERIVE":
      return "function";
    case "LIMIT":
      return "minimize";
    case "CUSTOM":
      return "code";
    default:
      return "cog";
  }
}

function stepTypeColor(type: string): string {
  switch (type) {
    case "FILTER":
      return "#2965cc";
    case "MAP":
      return "#29a634";
    case "AGGREGATE":
      return "#d99e0b";
    case "JOIN":
      return "#8f398f";
    case "SORT":
      return "#c23030";
    case "DERIVE":
      return "#00b3a4";
    case "LIMIT":
      return "#752f75";
    case "CUSTOM":
      return "#5c7080";
    default:
      return "#5c7080";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function scheduleLabel(schedule?: { type: string; interval?: number; cron?: string }): string {
  if (!schedule) return "Manual";
  switch (schedule.type) {
    case "MANUAL":
      return "Manual";
    case "INTERVAL":
      return schedule.interval
        ? `Every ${Math.round((schedule.interval ?? 0) / 60000)} min`
        : "Interval";
    case "CRON":
      return `Cron: ${schedule.cron ?? "?"}`;
    case "ON_UPDATE":
      return "On dataset update";
    default:
      return schedule.type;
  }
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("en-US")
      : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PipelineExplorer() {
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [runningPipeline, setRunningPipeline] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<Record<string, PipelineRun>>({});
  const [executeResults, setExecuteResults] = useState<Record<string, ExecuteResult>>({});

  const {
    data: pipelineData,
    loading,
    refetch,
  } = useApi<PipelineListResponse>("/api/v2/pipelines");

  // Fetch runs for expanded pipeline
  const { data: runsData, loading: runsLoading } = useApi<RunListResponse>(
    expandedPipeline ? `/api/v2/pipelines/${expandedPipeline}/runs` : "",
  );

  const pipelines = (pipelineData?.data ?? []).filter((p) => {
    if (!filter) return true;
    const text = `${p.name} ${p.description ?? ""} ${p.status}`.toLowerCase();
    return text.includes(filter.toLowerCase());
  });

  const toggleExpand = useCallback((rid: string) => {
    setExpandedPipeline((prev) => (prev === rid ? null : rid));
  }, []);

  const triggerRun = useCallback(
    async (pipeline: Pipeline) => {
      setRunningPipeline(pipeline.rid);
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v2/pipelines/${pipeline.rid}/execute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );
        if (res.ok) {
          const result = (await res.json()) as ExecuteResult;
          setLastRunResult((prev) => ({ ...prev, [pipeline.rid]: result }));
          setExecuteResults((prev) => ({ ...prev, [pipeline.rid]: result }));
          // Auto-expand to show results
          setExpandedPipeline(pipeline.rid);
          refetch();
        } else {
          const errBody = await res.json().catch(() => ({}));
          const errResult = errBody as ExecuteResult;
          if (errResult.status) {
            setLastRunResult((prev) => ({ ...prev, [pipeline.rid]: errResult }));
            setExecuteResults((prev) => ({ ...prev, [pipeline.rid]: errResult }));
          }
        }
      } finally {
        setRunningPipeline(null);
      }
    },
    [refetch],
  );

  // Auto-clear the success/failure banner after 15 seconds (keep the data table)
  useEffect(() => {
    const keys = Object.keys(lastRunResult);
    if (keys.length === 0) return;
    const timer = setTimeout(() => setLastRunResult({}), 15000);
    return () => clearTimeout(timer);
  }, [lastRunResult]);

  const runs = runsData?.data ?? [];

  return (
    <>
      <PageHeader title="Pipeline Builder" />

      {/* Toolbar */}
      <div className="toolbar">
        <InputGroup
          leftIcon="search"
          placeholder="Filter pipelines..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 300 }}
        />
        <Tag minimal large icon="data-lineage">
          {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}
        </Tag>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner size={40} />
      ) : pipelines.length === 0 ? (
        <NonIdealState
          icon="data-lineage"
          title="No pipelines"
          description="No data transformation pipelines have been created yet."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pipelines.map((pipeline) => {
            const isExpanded = expandedPipeline === pipeline.rid;
            const isRunning = runningPipeline === pipeline.rid;
            const lastRun = lastRunResult[pipeline.rid];
            const execResult = executeResults[pipeline.rid];

            return (
              <Card
                key={pipeline.rid}
                elevation={Elevation.ONE}
                style={{ padding: "12px 16px" }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleExpand(pipeline.rid)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon icon="data-lineage" />
                    <strong style={{ fontSize: "1rem" }}>{pipeline.name}</strong>
                    <Tag minimal intent={statusIntent(pipeline.status)}>
                      {pipeline.status}
                    </Tag>
                    <Tag minimal round icon="layers">
                      {pipeline.steps.length} step
                      {pipeline.steps.length !== 1 ? "s" : ""}
                    </Tag>
                    <Tag minimal round icon="time">
                      {scheduleLabel(pipeline.schedule)}
                    </Tag>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button
                      small
                      intent={Intent.PRIMARY}
                      icon="play"
                      text="Run"
                      loading={isRunning}
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerRun(pipeline);
                      }}
                    />
                    <Button
                      minimal
                      small
                      icon={isExpanded ? "chevron-up" : "chevron-down"}
                    />
                  </div>
                </div>

                {pipeline.description && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "#5c7080",
                      fontSize: "0.85rem",
                    }}
                  >
                    {pipeline.description}
                  </p>
                )}

                {/* Last run result banner */}
                {lastRun && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      borderRadius: 4,
                      background:
                        lastRun.status === "SUCCEEDED"
                          ? "#d4edda"
                          : lastRun.status === "FAILED"
                            ? "#f8d7da"
                            : "#d1ecf1",
                    }}
                  >
                    <strong>
                      {lastRun.status === "SUCCEEDED"
                        ? "Pipeline executed successfully"
                        : `Pipeline ${lastRun.status.toLowerCase()}`}
                    </strong>
                    {" -- "}
                    {execResult && (
                      <>
                        {execResult.sourceRowCount} source rows
                        {" -> "}
                        {execResult.outputRowCount} output rows
                        {" in "}
                        {execResult.executionMs}ms
                      </>
                    )}
                    {!execResult && (
                      <>
                        {lastRun.rowsProcessed} rows processed
                        {lastRun.stepResults.length > 0 && (
                          <>
                            {" in "}
                            {lastRun.stepResults.reduce(
                              (sum, s) => sum + s.durationMs,
                              0,
                            )}
                            ms
                          </>
                        )}
                      </>
                    )}
                    {lastRun.error && (
                      <span style={{ color: "#721c24" }}>
                        {" "}
                        | Error: {lastRun.error}
                      </span>
                    )}
                  </div>
                )}

                {/* Expanded details */}
                <Collapse isOpen={isExpanded}>
                  <div style={{ marginTop: 12 }}>
                    {/* DAG visualization */}
                    <h4 style={{ margin: "0 0 8px" }}>
                      <Icon icon="flow-linear" /> Pipeline Steps (DAG)
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 16,
                      }}
                    >
                      {pipeline.steps.map((step, idx) => (
                        <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Card
                            elevation={Elevation.TWO}
                            style={{
                              padding: "8px 14px",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              borderLeft: `3px solid ${stepTypeColor(step.type)}`,
                            }}
                          >
                            <Icon icon={stepTypeIcon(step.type) as any} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                                {step.name}
                              </div>
                              <Tag minimal small>
                                {step.type}
                              </Tag>
                            </div>
                          </Card>
                          {idx < pipeline.steps.length - 1 && (
                            <Icon icon="arrow-right" color="#5c7080" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Step details table */}
                    <HTMLTable
                      bordered
                      compact
                      striped
                      style={{ width: "100%", marginBottom: 16 }}
                    >
                      <thead>
                        <tr>
                          <th>Step</th>
                          <th>Type</th>
                          <th>Configuration</th>
                          <th>Dependencies</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pipeline.steps.map((step) => (
                          <tr key={step.id}>
                            <td>
                              <strong>{step.name}</strong>
                              <br />
                              <code style={{ fontSize: "0.75rem" }}>
                                {step.id}
                              </code>
                            </td>
                            <td>
                              <Tag
                                minimal
                                icon={stepTypeIcon(step.type) as any}
                              >
                                {step.type}
                              </Tag>
                            </td>
                            <td>
                              <code
                                style={{
                                  fontSize: "0.75rem",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                }}
                              >
                                {JSON.stringify(step.config, null, 2)}
                              </code>
                            </td>
                            <td>
                              {step.dependsOn && step.dependsOn.length > 0
                                ? step.dependsOn.map((dep) => (
                                    <Tag key={dep} minimal round style={{ marginRight: 4 }}>
                                      {dep}
                                    </Tag>
                                  ))
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </HTMLTable>

                    {/* Metadata */}
                    <div
                      style={{
                        display: "flex",
                        gap: 24,
                        fontSize: "0.8rem",
                        color: "#5c7080",
                        marginBottom: 16,
                      }}
                    >
                      <span>
                        <strong>Input:</strong>{" "}
                        {pipeline.inputDatasets.length > 0
                          ? pipeline.inputDatasets.join(", ")
                          : "None"}
                      </span>
                      <span>
                        <strong>Output:</strong>{" "}
                        {pipeline.outputDataset || "None"}
                      </span>
                      <span>
                        <strong>Created:</strong>{" "}
                        {formatDate(pipeline.createdAt)}
                      </span>
                      <span>
                        <strong>Updated:</strong>{" "}
                        {formatDate(pipeline.updatedAt)}
                      </span>
                    </div>

                    {/* ============================================================ */}
                    {/* Transform Result Data Table                                  */}
                    {/* ============================================================ */}
                    {execResult && execResult.resultData && execResult.resultData.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <h4 style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon icon="th" />
                          Transform Results
                          <Tag minimal intent={Intent.SUCCESS} round>
                            {execResult.outputRowCount} row{execResult.outputRowCount !== 1 ? "s" : ""}
                          </Tag>
                          <Tag minimal round icon="time">
                            {execResult.executionMs}ms
                          </Tag>
                        </h4>
                        <div
                          style={{
                            maxHeight: 400,
                            overflowY: "auto",
                            border: "1px solid #d8e1e8",
                            borderRadius: 4,
                          }}
                        >
                          <HTMLTable
                            bordered
                            compact
                            striped
                            style={{ width: "100%" }}
                          >
                            <thead>
                              <tr>
                                <th style={{ width: 40, textAlign: "center" }}>#</th>
                                {execResult.resultColumns.map((col) => (
                                  <th key={col}>{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {execResult.resultData.map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                  <td
                                    style={{
                                      textAlign: "center",
                                      color: "#8a9ba8",
                                      fontSize: "0.75rem",
                                    }}
                                  >
                                    {rowIdx + 1}
                                  </td>
                                  {execResult.resultColumns.map((col) => (
                                    <td key={col} style={{ fontSize: "0.85rem" }}>
                                      {formatCellValue(row[col])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </HTMLTable>
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: "0.75rem",
                            color: "#8a9ba8",
                            display: "flex",
                            gap: 16,
                          }}
                        >
                          <span>Source: {execResult.sourceRowCount} rows from {pipeline.inputDatasets[0] ?? "unknown"}</span>
                          <span>Output: {execResult.outputRowCount} rows</span>
                          <span>Steps: {execResult.stepResults.length}</span>
                          {execResult.stepResults.map((sr) => (
                            <span key={sr.stepId}>
                              {sr.stepId}: {sr.rowsIn}{"->"}
                              {sr.rowsOut} ({Math.round(sr.durationMs)}ms)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty result message */}
                    {execResult && execResult.resultData && execResult.resultData.length === 0 && execResult.status === "SUCCEEDED" && (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: "12px 16px",
                          background: "#fff3cd",
                          borderRadius: 4,
                          fontSize: "0.85rem",
                        }}
                      >
                        <Icon icon="info-sign" style={{ marginRight: 6 }} />
                        Pipeline executed successfully but produced 0 output rows.
                        The source had {execResult.sourceRowCount} rows -- all were
                        filtered out by the transform steps.
                      </div>
                    )}

                    {/* Run history */}
                    <h4 style={{ margin: "0 0 8px" }}>
                      <Icon icon="history" /> Run History
                    </h4>
                    {runsLoading ? (
                      <Spinner size={20} />
                    ) : runs.length === 0 ? (
                      <p style={{ color: "#5c7080", fontSize: "0.85rem" }}>
                        No runs recorded. Click "Run" to execute this pipeline.
                      </p>
                    ) : (
                      <HTMLTable
                        bordered
                        compact
                        striped
                        style={{ width: "100%" }}
                      >
                        <thead>
                          <tr>
                            <th>Run ID</th>
                            <th>Status</th>
                            <th>Rows</th>
                            <th>Started</th>
                            <th>Duration</th>
                            <th>Steps</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.map((run) => {
                            const totalMs = run.stepResults.reduce(
                              (sum, s) => sum + s.durationMs,
                              0,
                            );
                            return (
                              <tr key={run.rid}>
                                <td>
                                  <code style={{ fontSize: "0.75rem" }}>
                                    {run.rid.slice(-8)}
                                  </code>
                                </td>
                                <td>
                                  <Tag
                                    minimal
                                    intent={statusIntent(run.status)}
                                  >
                                    {run.status}
                                  </Tag>
                                </td>
                                <td>{run.rowsProcessed.toLocaleString("id-ID")}</td>
                                <td>{formatDate(run.startedAt)}</td>
                                <td>{totalMs}ms</td>
                                <td>
                                  <div style={{ display: "flex", gap: 2 }}>
                                    {run.stepResults.map((sr) => (
                                      <Tag
                                        key={sr.stepId}
                                        minimal
                                        small
                                        intent={statusIntent(sr.status)}
                                        title={`${sr.stepId}: ${sr.rowsIn}->${sr.rowsOut} (${sr.durationMs}ms)`}
                                      >
                                        {sr.rowsOut}
                                      </Tag>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </HTMLTable>
                    )}
                  </div>
                </Collapse>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
