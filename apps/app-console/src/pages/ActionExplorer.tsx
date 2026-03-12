import { useCallback, useState } from "react";
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
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ActionParameter {
  apiName: string;
  dataType: string;
  required?: boolean;
  description?: string;
}

interface ActionType {
  apiName: string;
  displayName?: string;
  description?: string;
  status?: string;
  parameters?: Record<string, ActionParameter>;
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
  const effectiveRid = selectedOntologyRid || (ontologies.length > 0 ? ontologies[0].rid : "");

  // Fetch action types for selected ontology
  const { data: actionData, loading: actionsLoading } =
    useApi<ActionTypeListResponse>(
      effectiveRid ? `/api/v2/ontologies/${effectiveRid}/actionTypes` : "",
    );

  const actionTypes = (actionData?.data ?? []).filter((a) => {
    if (!filter) return true;
    const text = `${a.apiName} ${a.displayName ?? ""} ${a.description ?? ""}`.toLowerCase();
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
            const params = action.parameters
              ? Object.values(action.parameters)
              : [];
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
                      style={{ marginLeft: 8, color: "#5c7080", fontSize: "0.85rem" }}
                    >
                      {action.apiName}
                    </span>
                    {action.status && (
                      <Tag minimal style={{ marginLeft: 8 }} intent={
                        action.status === "ACTIVE" ? Intent.SUCCESS : Intent.WARNING
                      }>
                        {action.status}
                      </Tag>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Tag minimal round>
                      {params.length} param{params.length !== 1 ? "s" : ""}
                    </Tag>
                    <Button
                      minimal
                      small
                      icon={isExpanded ? "chevron-up" : "chevron-down"}
                    />
                  </div>
                </div>

                {action.description && (
                  <p style={{ margin: "4px 0 0", color: "#5c7080", fontSize: "0.85rem" }}>
                    {action.description}
                  </p>
                )}

                <Collapse isOpen={isExpanded}>
                  <div style={{ marginTop: 12 }}>
                    {params.length === 0 ? (
                      <p style={{ color: "#5c7080" }}>No parameters defined.</p>
                    ) : (
                      <HTMLTable
                        bordered
                        compact
                        striped
                        style={{ width: "100%" }}
                      >
                        <thead>
                          <tr>
                            <th>Parameter</th>
                            <th>Type</th>
                            <th>Required</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {params.map((p) => (
                            <tr key={p.apiName}>
                              <td>
                                <code>{p.apiName}</code>
                              </td>
                              <td>
                                <Tag minimal>{p.dataType}</Tag>
                              </td>
                              <td>
                                {p.required ? (
                                  <Tag intent={Intent.PRIMARY} minimal>
                                    Yes
                                  </Tag>
                                ) : (
                                  "No"
                                )}
                              </td>
                              <td>{p.description ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </HTMLTable>
                    )}

                    <div style={{ marginTop: 8 }}>
                      <Button
                        small
                        icon="history"
                        text="View Execution History"
                        minimal
                        onClick={() => {
                          /* placeholder for future linking */
                        }}
                      />
                    </div>
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
