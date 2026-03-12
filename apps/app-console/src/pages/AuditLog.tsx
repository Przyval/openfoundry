import { useCallback, useState } from "react";
import {
  Button,
  ButtonGroup,
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

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resourceType: string;
  resourceRid: string;
  details?: string;
}

interface AuditLogResponse {
  data: AuditEntry[];
  nextPageToken?: string;
}

/* ------------------------------------------------------------------ */
/*  Action tag coloring                                                 */
/* ------------------------------------------------------------------ */

function intentForAction(action: string): Intent {
  switch (action) {
    case "CREATE":
      return Intent.SUCCESS;
    case "UPDATE":
      return Intent.PRIMARY;
    case "DELETE":
      return Intent.DANGER;
    case "EXECUTE":
      return Intent.WARNING;
    case "LOGIN":
      return Intent.NONE;
    default:
      return Intent.NONE;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AuditLog() {
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [pageTokens, setPageTokens] = useState<string[]>([]);

  const currentToken = pageTokens[pageTokens.length - 1] ?? "";

  // Build query string
  const params = new URLSearchParams();
  if (filterAction) params.set("action", filterAction);
  if (filterUser) params.set("user", filterUser);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);
  if (currentToken) params.set("pageToken", currentToken);
  params.set("pageSize", "25");

  const qs = params.toString();
  const { data, loading } = useApi<AuditLogResponse>(
    `/api/v2/admin/audit${qs ? `?${qs}` : ""}`,
  );

  const entries = data?.data ?? [];

  const handlePrevious = useCallback(() => {
    setPageTokens((tokens) => tokens.slice(0, -1));
  }, []);

  const handleNext = useCallback(() => {
    if (data?.nextPageToken) {
      setPageTokens((tokens) => [...tokens, data.nextPageToken!]);
    }
  }, [data?.nextPageToken]);

  const handleClearFilters = useCallback(() => {
    setFilterAction("");
    setFilterUser("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setPageTokens([]);
  }, []);

  return (
    <>
      <PageHeader
        title="Audit Log"
        actions={
          <Button minimal icon="filter-remove" text="Clear Filters" onClick={handleClearFilters} />
        }
      />

      {/* Filters */}
      <div className="toolbar">
        <div className="bp5-html-select">
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPageTokens([]);
            }}
          >
            <option value="">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="EXECUTE">EXECUTE</option>
            <option value="LOGIN">LOGIN</option>
          </select>
          <span className="bp5-icon bp5-icon-double-caret-vertical" />
        </div>

        <InputGroup
          leftIcon="person"
          placeholder="Filter by user..."
          value={filterUser}
          onChange={(e) => {
            setFilterUser(e.target.value);
            setPageTokens([]);
          }}
          style={{ width: 200 }}
        />

        <InputGroup
          leftIcon="calendar"
          type="date"
          placeholder="From date"
          value={filterDateFrom}
          onChange={(e) => {
            setFilterDateFrom(e.target.value);
            setPageTokens([]);
          }}
          style={{ width: 160 }}
        />

        <InputGroup
          leftIcon="calendar"
          type="date"
          placeholder="To date"
          value={filterDateTo}
          onChange={(e) => {
            setFilterDateTo(e.target.value);
            setPageTokens([]);
          }}
          style={{ width: 160 }}
        />
      </div>

      {/* Content */}
      {loading ? (
        <Spinner size={40} />
      ) : entries.length === 0 ? (
        <NonIdealState
          icon="document"
          title="No audit entries"
          description="Audit log entries will appear here as actions are performed."
        />
      ) : (
        <>
          <HTMLTable bordered compact striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource Type</th>
                <th>Resource RID</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td>{entry.user}</td>
                  <td>
                    <Tag minimal intent={intentForAction(entry.action)}>
                      {entry.action}
                    </Tag>
                  </td>
                  <td>{entry.resourceType}</td>
                  <td>
                    <code style={{ fontSize: "0.8rem" }}>{entry.resourceRid}</code>
                  </td>
                  <td style={{ fontSize: "0.85rem", color: "#5c7080" }}>
                    {entry.details ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>

          {/* Pagination */}
          <ButtonGroup style={{ marginTop: 12 }}>
            <Button
              icon="chevron-left"
              text="Previous"
              disabled={pageTokens.length === 0}
              onClick={handlePrevious}
            />
            <Button
              rightIcon="chevron-right"
              text="Next"
              disabled={!data?.nextPageToken}
              onClick={handleNext}
            />
          </ButtonGroup>
        </>
      )}
    </>
  );
}
