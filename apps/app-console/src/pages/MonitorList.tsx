import { useCallback, useState } from "react";
import {
  Button,
  Card,
  Collapse,
  Dialog,
  DialogBody,
  DialogFooter,
  Elevation,
  FormGroup,
  InputGroup,
  Intent,
  NonIdealState,
  Spinner,
  Switch,
  Tag,
} from "@blueprintjs/core";
import PageHeader from "../components/PageHeader";
import { useApi } from "../hooks/useApi";
import { API_BASE_URL } from "../config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TriggerConfig {
  type: string;
  schedule?: string;
  event?: string;
  condition?: string;
}

interface Effect {
  type: string;
  target?: string;
  action?: string;
}

interface Monitor {
  rid: string;
  name: string;
  description?: string;
  status: "ACTIVE" | "PAUSED";
  trigger: TriggerConfig;
  effects: Effect[];
  lastRun?: string;
  createdAt: string;
}

interface MonitorListResponse {
  data: Monitor[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MonitorList() {
  const { data, loading, refetch } = useApi<MonitorListResponse>("/api/v2/monitors");
  const [expandedRid, setExpandedRid] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTriggerType, setNewTriggerType] = useState("schedule");
  const [newSchedule, setNewSchedule] = useState("");
  const [creating, setCreating] = useState(false);

  const monitors = data?.data ?? [];

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/monitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDesc || undefined,
          trigger: {
            type: newTriggerType,
            schedule: newSchedule || undefined,
          },
          effects: [],
        }),
      });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      setNewSchedule("");
      refetch();
    } finally {
      setCreating(false);
    }
  }, [newName, newDesc, newTriggerType, newSchedule, refetch]);

  const handleToggleStatus = useCallback(
    async (monitor: Monitor) => {
      const newStatus = monitor.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await fetch(`${API_BASE_URL}/api/v2/monitors/${monitor.rid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      refetch();
    },
    [refetch],
  );

  const handleDelete = useCallback(
    async (rid: string) => {
      await fetch(`${API_BASE_URL}/api/v2/monitors/${rid}`, {
        method: "DELETE",
      });
      refetch();
    },
    [refetch],
  );

  return (
    <>
      <PageHeader
        title="Monitors"
        actions={
          <Button
            icon="add"
            intent={Intent.PRIMARY}
            text="Create Monitor"
            onClick={() => setCreateOpen(true)}
          />
        }
      />

      {/* Content */}
      {loading ? (
        <Spinner size={40} />
      ) : monitors.length === 0 ? (
        <NonIdealState
          icon="eye-open"
          title="No monitors configured"
          description="Create monitors to automate actions based on triggers."
          action={
            <Button
              icon="add"
              intent={Intent.PRIMARY}
              text="Create Monitor"
              onClick={() => setCreateOpen(true)}
            />
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {monitors.map((mon) => {
            const isExpanded = expandedRid === mon.rid;

            return (
              <Card
                key={mon.rid}
                elevation={Elevation.ONE}
                style={{ padding: "14px 18px" }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Tag
                      intent={mon.status === "ACTIVE" ? Intent.SUCCESS : Intent.WARNING}
                      large
                    >
                      {mon.status}
                    </Tag>
                    <div>
                      <strong>{mon.name}</strong>
                      {mon.description && (
                        <div style={{ fontSize: "0.82rem", color: "#5c7080" }}>
                          {mon.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Switch
                      checked={mon.status === "ACTIVE"}
                      onChange={() => handleToggleStatus(mon)}
                      innerLabel="off"
                      innerLabelChecked="on"
                      style={{ marginBottom: 0 }}
                    />
                    <Button
                      minimal
                      small
                      icon={isExpanded ? "chevron-up" : "chevron-down"}
                      onClick={() =>
                        setExpandedRid(isExpanded ? null : mon.rid)
                      }
                    />
                    <Button
                      minimal
                      small
                      icon="trash"
                      intent={Intent.DANGER}
                      onClick={() => handleDelete(mon.rid)}
                    />
                  </div>
                </div>

                {/* Trigger summary */}
                <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                  <Tag minimal icon="lightning">
                    {mon.trigger.type}
                  </Tag>
                  {mon.trigger.schedule && (
                    <Tag minimal>
                      {mon.trigger.schedule}
                    </Tag>
                  )}
                  {mon.trigger.event && (
                    <Tag minimal>
                      {mon.trigger.event}
                    </Tag>
                  )}
                  {mon.effects.length > 0 && (
                    <Tag minimal intent={Intent.PRIMARY}>
                      {mon.effects.length} effect{mon.effects.length !== 1 ? "s" : ""}
                    </Tag>
                  )}
                </div>

                {/* Expanded details */}
                <Collapse isOpen={isExpanded}>
                  <div style={{ marginTop: 12 }}>
                    {/* Trigger Details */}
                    <h5 style={{ margin: "0 0 6px" }}>Trigger Configuration</h5>
                    <pre
                      style={{
                        background: "#f5f8fa",
                        padding: 10,
                        borderRadius: 4,
                        fontSize: "0.82rem",
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(mon.trigger, null, 2)}
                    </pre>

                    {/* Effects */}
                    <h5 style={{ margin: "12px 0 6px" }}>Effects</h5>
                    {mon.effects.length === 0 ? (
                      <p style={{ color: "#5c7080", fontSize: "0.85rem" }}>
                        No effects configured.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {mon.effects.map((eff, idx) => (
                          <Card
                            key={idx}
                            elevation={Elevation.ZERO}
                            style={{ padding: "8px 12px" }}
                          >
                            <Tag minimal>{eff.type}</Tag>
                            {eff.target && (
                              <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>
                                Target: <code>{eff.target}</code>
                              </span>
                            )}
                            {eff.action && (
                              <span style={{ marginLeft: 8, fontSize: "0.85rem" }}>
                                Action: <code>{eff.action}</code>
                              </span>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}

                    {/* Last Run */}
                    {mon.lastRun && (
                      <p
                        style={{
                          marginTop: 10,
                          fontSize: "0.82rem",
                          color: "#5c7080",
                        }}
                      >
                        Last run: {new Date(mon.lastRun).toLocaleString()}
                      </p>
                    )}
                  </div>
                </Collapse>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: "0.78rem",
                    color: "#8a9ba8",
                  }}
                >
                  Created {new Date(mon.createdAt).toLocaleDateString()} &middot;{" "}
                  <code>{mon.rid}</code>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Monitor Dialog */}
      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Monitor"
      >
        <DialogBody>
          <FormGroup label="Name" labelFor="mon-name">
            <InputGroup
              id="mon-name"
              placeholder="My Monitor"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Description" labelFor="mon-desc">
            <InputGroup
              id="mon-desc"
              placeholder="Optional description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="Trigger Type" labelFor="mon-trigger">
            <div className="bp5-html-select">
              <select
                id="mon-trigger"
                value={newTriggerType}
                onChange={(e) => setNewTriggerType(e.target.value)}
              >
                <option value="schedule">Schedule (Cron)</option>
                <option value="event">Event</option>
                <option value="condition">Condition</option>
              </select>
              <span className="bp5-icon bp5-icon-double-caret-vertical" />
            </div>
          </FormGroup>
          {newTriggerType === "schedule" && (
            <FormGroup label="Schedule (Cron Expression)" labelFor="mon-schedule">
              <InputGroup
                id="mon-schedule"
                placeholder="0 */5 * * *"
                value={newSchedule}
                onChange={(e) => setNewSchedule(e.target.value)}
              />
            </FormGroup>
          )}
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setCreateOpen(false)} />
              <Button
                intent={Intent.PRIMARY}
                text="Create"
                loading={creating}
                disabled={!newName}
                onClick={handleCreate}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}
