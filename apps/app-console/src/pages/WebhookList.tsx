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
  HTMLTable,
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

interface WebhookDelivery {
  id: string;
  timestamp: string;
  statusCode: number;
  success: boolean;
  durationMs: number;
}

interface Webhook {
  rid: string;
  name: string;
  url: string;
  events: string[];
  status: "ACTIVE" | "PAUSED" | "FAILED";
  secret?: string;
  createdAt: string;
  recentDeliveries?: WebhookDelivery[];
}

interface WebhookListResponse {
  data: Webhook[];
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function statusIntent(status: string): Intent {
  switch (status) {
    case "ACTIVE":
      return Intent.SUCCESS;
    case "PAUSED":
      return Intent.WARNING;
    case "FAILED":
      return Intent.DANGER;
    default:
      return Intent.NONE;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WebhookList() {
  const { data, loading, refetch } = useApi<WebhookListResponse>("/api/v2/webhooks");
  const [expandedRid, setExpandedRid] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState("");
  const [creating, setCreating] = useState(false);

  const webhooks = data?.data ?? [];

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          url: newUrl,
          events: newEvents
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      });
      setCreateOpen(false);
      setNewName("");
      setNewUrl("");
      setNewEvents("");
      refetch();
    } finally {
      setCreating(false);
    }
  }, [newName, newUrl, newEvents, refetch]);

  const handleDelete = useCallback(
    async (rid: string) => {
      await fetch(`${API_BASE_URL}/api/v2/webhooks/${rid}`, {
        method: "DELETE",
      });
      refetch();
    },
    [refetch],
  );

  const handleToggleStatus = useCallback(
    async (webhook: Webhook) => {
      const newStatus = webhook.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      await fetch(`${API_BASE_URL}/api/v2/webhooks/${webhook.rid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      refetch();
    },
    [refetch],
  );

  return (
    <>
      <PageHeader
        title="Webhooks"
        actions={
          <Button
            icon="add"
            intent={Intent.PRIMARY}
            text="Create Webhook"
            onClick={() => setCreateOpen(true)}
          />
        }
      />

      {/* Content */}
      {loading ? (
        <Spinner size={40} />
      ) : webhooks.length === 0 ? (
        <NonIdealState
          icon="globe-network"
          title="No webhooks configured"
          description="Create a webhook to receive event notifications."
          action={
            <Button
              icon="add"
              intent={Intent.PRIMARY}
              text="Create Webhook"
              onClick={() => setCreateOpen(true)}
            />
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {webhooks.map((wh) => {
            const isExpanded = expandedRid === wh.rid;
            const deliveries = wh.recentDeliveries ?? [];

            return (
              <Card
                key={wh.rid}
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
                    <Tag intent={statusIntent(wh.status)} large>
                      {wh.status}
                    </Tag>
                    <div>
                      <strong>{wh.name}</strong>
                      <div style={{ fontSize: "0.82rem", color: "#5c7080" }}>
                        {wh.url}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Switch
                      checked={wh.status === "ACTIVE"}
                      onChange={() => handleToggleStatus(wh)}
                      innerLabel="off"
                      innerLabelChecked="on"
                      style={{ marginBottom: 0 }}
                    />
                    <Button
                      minimal
                      small
                      icon={isExpanded ? "chevron-up" : "chevron-down"}
                      onClick={() =>
                        setExpandedRid(isExpanded ? null : wh.rid)
                      }
                    />
                    <Button
                      minimal
                      small
                      icon="trash"
                      intent={Intent.DANGER}
                      onClick={() => handleDelete(wh.rid)}
                    />
                  </div>
                </div>

                {/* Events */}
                <div style={{ marginTop: 6 }}>
                  {wh.events.map((ev) => (
                    <Tag key={ev} minimal style={{ marginRight: 4, marginBottom: 4 }}>
                      {ev}
                    </Tag>
                  ))}
                </div>

                {/* Delivery History */}
                <Collapse isOpen={isExpanded}>
                  <div style={{ marginTop: 12 }}>
                    <h5 style={{ margin: "0 0 8px" }}>Recent Deliveries</h5>
                    {deliveries.length === 0 ? (
                      <p style={{ color: "#5c7080", fontSize: "0.85rem" }}>
                        No deliveries recorded yet.
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
                            <th>Timestamp</th>
                            <th>Status</th>
                            <th>HTTP Code</th>
                            <th>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveries.map((d) => (
                            <tr key={d.id}>
                              <td style={{ fontSize: "0.85rem" }}>
                                {new Date(d.timestamp).toLocaleString()}
                              </td>
                              <td>
                                <Tag
                                  minimal
                                  intent={
                                    d.success ? Intent.SUCCESS : Intent.DANGER
                                  }
                                >
                                  {d.success ? "OK" : "FAILED"}
                                </Tag>
                              </td>
                              <td>{d.statusCode}</td>
                              <td>{d.durationMs}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </HTMLTable>
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
                  Created {new Date(wh.createdAt).toLocaleDateString()} &middot;{" "}
                  <code>{wh.rid}</code>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Webhook"
      >
        <DialogBody>
          <FormGroup label="Name" labelFor="wh-name">
            <InputGroup
              id="wh-name"
              placeholder="My Webhook"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </FormGroup>
          <FormGroup label="URL" labelFor="wh-url">
            <InputGroup
              id="wh-url"
              placeholder="https://example.com/hook"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </FormGroup>
          <FormGroup
            label="Events"
            labelFor="wh-events"
            helperText="Comma-separated event names"
          >
            <InputGroup
              id="wh-events"
              placeholder="object.created, object.updated"
              value={newEvents}
              onChange={(e) => setNewEvents(e.target.value)}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setCreateOpen(false)} />
              <Button
                intent={Intent.PRIMARY}
                text="Create"
                loading={creating}
                disabled={!newName || !newUrl}
                onClick={handleCreate}
              />
            </>
          }
        />
      </Dialog>
    </>
  );
}
