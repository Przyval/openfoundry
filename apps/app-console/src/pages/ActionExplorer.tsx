import { useCallback, useState } from "react";
import {
  Button,
  Callout,
  Card,
  Collapse,
  Elevation,
  HTMLTable,
  InputGroup,
  NonIdealState,
  NumericInput,
  Spinner,
  Tag,
  Intent,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ActionParameterDef {
  type: string;
  required?: boolean;
  description?: string;
}

interface ActionType {
  apiName: string;
  displayName?: string;
  description?: string;
  status?: string;
  parameters?: Record<string, ActionParameterDef>;
}

interface ActionTypeListResponse {
  data: ActionType[];
}

interface OntologyListItem {
  apiName: string;
  displayName: string;
  rid: string;
}

interface OntologyListResponse {
  data: OntologyListItem[];
}

/* ------------------------------------------------------------------ */
/*  Execution form (per-action)                                        */
/* ------------------------------------------------------------------ */

interface ExecutionFormProps {
  action: ActionType;
  effectiveRid: string;
}

function ExecutionForm({ action, effectiveRid }: ExecutionFormProps) {
  const paramEntries = Object.entries(action.parameters ?? {});

  const [formValues, setFormValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(paramEntries.map(([key]) => [key, ""])),
  );
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ ok: true; data: unknown } | { ok: false; message: string } | null>(null);

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleRun = async () => {
    setExecuting(true);
    setResult(null);
    try {
      // Coerce integer-typed params to numbers
      const coerced: Record<string, unknown> = {};
      for (const [key, rawValue] of Object.entries(formValues)) {
        const def = action.parameters?.[key];
        const typeStr = (def?.type ?? "").toLowerCase();
        if (typeStr === "integer" || typeStr === "long" || typeStr === "double" || typeStr === "float") {
          const num = Number(rawValue);
          coerced[key] = rawValue === "" ? undefined : num;
        } else {
          coerced[key] = rawValue === "" ? undefined : rawValue;
        }
      }

      const response = await fetch(
        `${API_BASE_URL}/api/v2/ontologies/${effectiveRid}/actions/${action.apiName}/apply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ parameters: coerced }),
        },
      );

      if (response.ok) {
        const data = await response.json().catch(() => null);
        setResult({ ok: true, data });
      } else {
        let message = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errBody = await response.json();
          if (errBody?.message) message = errBody.message;
          else if (errBody?.errorMessage) message = errBody.errorMessage;
          else message = JSON.stringify(errBody, null, 2);
        } catch {
          // ignore parse errors
        }
        setResult({ ok: false, message });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid rgba(16,22,26,.15)", paddingTop: 12 }}>
      <strong style={{ fontSize: "0.9rem" }}>Execute Action</strong>

      {paramEntries.length === 0 ? (
        <p style={{ color: "#5c7080", margin: "8px 0" }}>This action takes no parameters.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {paramEntries.map(([key, def]) => {
            const typeStr = (def.type ?? "").toLowerCase();
            const isNumeric =
              typeStr === "integer" ||
              typeStr === "long" ||
              typeStr === "double" ||
              typeStr === "float";

            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 180, flexShrink: 0 }}>
                  <code style={{ fontSize: "0.85rem" }}>{key}</code>
                  {def.required && (
                    <Tag intent={Intent.PRIMARY} minimal small style={{ marginLeft: 4 }}>
                      required
                    </Tag>
                  )}
                  <div style={{ color: "#5c7080", fontSize: "0.75rem" }}>{def.type}</div>
                </div>
                <div style={{ flex: 1 }}>
                  {isNumeric ? (
                    <NumericInput
                      fill
                      placeholder={def.description ?? key}
                      value={formValues[key] ?? ""}
                      onValueChange={(_num, strVal) => handleChange(key, strVal)}
                      disabled={executing}
                    />
                  ) : (
                    <InputGroup
                      fill
                      placeholder={def.description ?? key}
                      value={formValues[key] ?? ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      disabled={executing}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <Button
          intent={Intent.PRIMARY}
          icon="play"
          text={executing ? "Running…" : "Run Action"}
          loading={executing}
          disabled={executing}
          onClick={handleRun}
          small
        />
      </div>

      {result !== null && (
        <div style={{ marginTop: 10 }}>
          {result.ok ? (
            <Callout intent={Intent.SUCCESS} title="Action executed successfully" icon="tick-circle">
              <pre
                style={{
                  margin: "6px 0 0",
                  fontSize: "0.8rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </Callout>
          ) : (
            <Callout intent={Intent.DANGER} title="Execution failed" icon="error">
              <pre
                style={{
                  margin: "6px 0 0",
                  fontSize: "0.8rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {result.message}
              </pre>
            </Callout>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ActionExplorer() {
  const [selectedOntologyRid, setSelectedOntologyRid] = useState<string>("");
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Fetch ontology list to let user pick one
  const { data: ontologyList, loading: ontologiesLoading } =
    useApi<OntologyListResponse>("/api/v2/ontologies");

  const ontologies = ontologyList?.data ?? [];

  // Auto-select first ontology if none selected
  const effectiveRid =
    selectedOntologyRid || (ontologies.length > 0 ? ontologies[0].rid : "");

  // Fetch action types for selected ontology
  const { data: actionData, loading: actionsLoading } =
    useApi<ActionTypeListResponse>(
      effectiveRid ? `/api/v2/ontologies/${effectiveRid}/actionTypes` : "",
    );

  const actionTypes = (actionData?.data ?? []).filter((a) => {
    if (!filter) return true;
    const text =
      `${a.apiName} ${a.displayName ?? ""} ${a.description ?? ""}`.toLowerCase();
    return text.includes(filter.toLowerCase());
  });

  const toggleExpand = useCallback((apiName: string) => {
    setExpandedAction((prev) => (prev === apiName ? null : apiName));
  }, []);

  return (
    <>
      <PageHeader title="Action Explorer" />

      {/* Toolbar */}
      <div className="toolbar">
        <div className="bp5-html-select">
          <select
            value={effectiveRid}
            onChange={(e) => setSelectedOntologyRid(e.target.value)}
          >
            {ontologies.map((o) => (
              <option key={o.rid} value={o.rid}>
                {o.displayName || o.apiName}
              </option>
            ))}
            {ontologies.length === 0 && <option value="">No ontologies</option>}
          </select>
          <span className="bp5-icon bp5-icon-double-caret-vertical" />
        </div>
        <InputGroup
          leftIcon="search"
          placeholder="Filter actions..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      {/* Content */}
      {ontologiesLoading || actionsLoading ? (
        <Spinner size={40} />
      ) : actionTypes.length === 0 ? (
        <NonIdealState
          icon="play"
          title="No actions found"
          description={
            effectiveRid
              ? "This ontology has no registered action types."
              : "Select an ontology to view its actions."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {actionTypes.map((action) => {
            const paramEntries = Object.entries(action.parameters ?? {});
            const isExpanded = expandedAction === action.apiName;

            return (
              <Card
                key={action.apiName}
                elevation={Elevation.ONE}
                style={{ padding: "12px 16px" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleExpand(action.apiName)}
                >
                  <div>
                    <strong style={{ fontSize: "1rem" }}>
                      {action.displayName || action.apiName}
                    </strong>
                    <span
                      style={{
                        marginLeft: 8,
                        color: "#5c7080",
                        fontSize: "0.85rem",
                      }}
                    >
                      {action.apiName}
                    </span>
                    {action.status && (
                      <Tag
                        minimal
                        style={{ marginLeft: 8 }}
                        intent={
                          action.status === "ACTIVE"
                            ? Intent.SUCCESS
                            : Intent.WARNING
                        }
                      >
                        {action.status}
                      </Tag>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag minimal round>
                      {paramEntries.length} param
                      {paramEntries.length !== 1 ? "s" : ""}
                    </Tag>
                    <Button
                      minimal
                      small
                      icon={isExpanded ? "chevron-up" : "chevron-down"}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        toggleExpand(action.apiName);
                      }}
                    />
                  </div>
                </div>

                {action.description && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "#5c7080",
                      fontSize: "0.85rem",
                    }}
                  >
                    {action.description}
                  </p>
                )}

                <Collapse isOpen={isExpanded} keepChildrenMounted>
                  <div style={{ marginTop: 12 }}>
                    {/* Parameters table */}
                    {paramEntries.length === 0 ? (
                      <p style={{ color: "#5c7080" }}>No parameters defined.</p>
                    ) : (
                      <HTMLTable bordered compact striped style={{ width: "100%" }}>
                        <thead>
                          <tr>
                            <th>Parameter</th>
                            <th>Type</th>
                            <th>Required</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paramEntries.map(([key, def]) => (
                            <tr key={key}>
                              <td>
                                <code>{key}</code>
                              </td>
                              <td>
                                <Tag minimal>{def.type}</Tag>
                              </td>
                              <td>
                                {def.required ? (
                                  <Tag intent={Intent.PRIMARY} minimal>
                                    Yes
                                  </Tag>
                                ) : (
                                  "No"
                                )}
                              </td>
                              <td>{def.description ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </HTMLTable>
                    )}

                    {/* Execution form */}
                    <ExecutionForm action={action} effectiveRid={effectiveRid} />
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
