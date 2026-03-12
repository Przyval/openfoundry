import { useCallback, useState } from "react";
import {
  Button,
  Card,
  Callout,
  Dialog,
  DialogBody,
  DialogFooter,
  Elevation,
  InputGroup,
  Intent,
  NonIdealState,
  Spinner,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FunctionDef {
  rid: string;
  apiName: string;
  displayName?: string;
  description?: string;
  language?: string;
  code?: string;
  status?: string;
}

interface FunctionListResponse {
  data: FunctionDef[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function FunctionList() {
  const { data, loading } = useApi<FunctionListResponse>("/api/v2/functions");
  const [filter, setFilter] = useState("");
  const [executeRid, setExecuteRid] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);

  const functions = (data?.data ?? []).filter((f) => {
    if (!filter) return true;
    const text = `${f.apiName} ${f.displayName ?? ""} ${f.description ?? ""}`.toLowerCase();
    return text.includes(filter.toLowerCase());
  });

  const handleExecute = useCallback(async () => {
    if (!executeRid) return;
    setExecuting(true);
    setExecuteResult(null);
    setExecuteError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/functions/${executeRid}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const result = await res.json();
      setExecuteResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  }, [executeRid]);

  return (
    <>
      <PageHeader title="Functions" />

      {/* Toolbar */}
      <div className="toolbar">
        <InputGroup
          leftIcon="search"
          placeholder="Filter functions..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      {/* Content */}
      {loading ? (
        <Spinner size={40} />
      ) : functions.length === 0 ? (
        <NonIdealState
          icon="function"
          title="No functions found"
          description="Register functions via the API to see them here."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {functions.map((fn) => (
            <Card key={fn.rid} elevation={Elevation.ONE} style={{ padding: "16px 20px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <div>
                  <strong style={{ fontSize: "1rem" }}>
                    {fn.displayName || fn.apiName}
                  </strong>
                  <span style={{ marginLeft: 8, color: "#5c7080", fontSize: "0.85rem" }}>
                    {fn.apiName}
                  </span>
                  {fn.language && (
                    <Tag minimal style={{ marginLeft: 8 }}>
                      {fn.language}
                    </Tag>
                  )}
                  {fn.status && (
                    <Tag
                      minimal
                      style={{ marginLeft: 4 }}
                      intent={fn.status === "ACTIVE" ? Intent.SUCCESS : Intent.WARNING}
                    >
                      {fn.status}
                    </Tag>
                  )}
                </div>
                <Button
                  small
                  icon="play"
                  intent={Intent.PRIMARY}
                  text="Execute"
                  onClick={() => setExecuteRid(fn.rid)}
                />
              </div>

              {fn.description && (
                <p style={{ margin: "0 0 8px", color: "#5c7080", fontSize: "0.85rem" }}>
                  {fn.description}
                </p>
              )}

              {fn.code && (
                <pre
                  style={{
                    background: "#1c2127",
                    color: "#a7b6c2",
                    padding: 12,
                    borderRadius: 4,
                    fontSize: "0.82rem",
                    overflow: "auto",
                    maxHeight: 200,
                    margin: 0,
                  }}
                >
                  <code>{fn.code}</code>
                </pre>
              )}

              <div style={{ marginTop: 4, color: "#5c7080", fontSize: "0.8rem" }}>
                <code>{fn.rid}</code>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Execute Dialog */}
      <Dialog
        isOpen={!!executeRid}
        onClose={() => {
          setExecuteRid(null);
          setExecuteResult(null);
          setExecuteError(null);
        }}
        title="Execute Function"
        style={{ width: 600 }}
      >
        <DialogBody>
          <p>
            Execute function <code>{executeRid}</code>
          </p>

          {executeError && (
            <Callout intent={Intent.DANGER} title="Execution Failed" style={{ marginBottom: 12 }}>
              {executeError}
            </Callout>
          )}

          {executeResult && (
            <pre
              style={{
                background: "#1c2127",
                color: "#a7b6c2",
                padding: 12,
                borderRadius: 4,
                fontSize: "0.82rem",
                overflow: "auto",
                maxHeight: 300,
              }}
            >
              {executeResult}
            </pre>
          )}
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button
                text="Close"
                onClick={() => {
                  setExecuteRid(null);
                  setExecuteResult(null);
                  setExecuteError(null);
                }}
              />
              <Button
                intent={Intent.PRIMARY}
                text="Run"
                icon="play"
                loading={executing}
                onClick={handleExecute}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}
