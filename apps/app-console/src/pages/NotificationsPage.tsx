import { useCallback, useMemo, useState } from "react";
import {
  Button,
  Card,
  Elevation,
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

type Severity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

interface Notification {
  rid: string;
  message: string;
  severity: Severity;
  monitorName: string;
  timestamp: string;
  read: boolean;
}

interface NotificationListResponse {
  data: Notification[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const SEVERITY_INTENT: Record<Severity, Intent> = {
  INFO: Intent.PRIMARY,
  WARNING: Intent.WARNING,
  ERROR: Intent.DANGER,
  CRITICAL: Intent.DANGER,
};

const SEVERITY_OPTIONS: Array<{ value: Severity | "ALL"; label: string }> = [
  { value: "ALL", label: "All Severities" },
  { value: "INFO", label: "Info" },
  { value: "WARNING", label: "Warning" },
  { value: "ERROR", label: "Error" },
  { value: "CRITICAL", label: "Critical" },
];

const READ_OPTIONS: Array<{ value: "ALL" | "READ" | "UNREAD"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NotificationsPage() {
  const { data, loading, refetch } =
    useApi<NotificationListResponse>("/api/v2/notifications");

  const [severityFilter, setSeverityFilter] = useState<Severity | "ALL">("ALL");
  const [readFilter, setReadFilter] = useState<"ALL" | "READ" | "UNREAD">("ALL");
  const [markingAll, setMarkingAll] = useState(false);

  const notifications = data?.data ?? [];

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (severityFilter !== "ALL" && n.severity !== severityFilter) return false;
      if (readFilter === "READ" && !n.read) return false;
      if (readFilter === "UNREAD" && n.read) return false;
      return true;
    });
  }, [notifications, severityFilter, readFilter]);

  const handleMarkRead = useCallback(
    async (rid: string) => {
      await fetch(`${API_BASE_URL}/api/v2/notifications/${rid}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      refetch();
    },
    [refetch],
  );

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await fetch(`${API_BASE_URL}/api/v2/notifications/read-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      refetch();
    } finally {
      setMarkingAll(false);
    }
  }, [refetch]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <Button
            icon="tick"
            intent={Intent.PRIMARY}
            text={`Mark All Read${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
            loading={markingAll}
            disabled={unreadCount === 0}
            onClick={handleMarkAllRead}
          />
        }
      />

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <div className="bp5-html-select">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | "ALL")}
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="bp5-icon bp5-icon-double-caret-vertical" />
        </div>

        <div className="bp5-html-select">
          <select
            value={readFilter}
            onChange={(e) =>
              setReadFilter(e.target.value as "ALL" | "READ" | "UNREAD")
            }
          >
            {READ_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="bp5-icon bp5-icon-double-caret-vertical" />
        </div>

        <span style={{ fontSize: "0.85rem", color: "#8a9ba8" }}>
          {filtered.length} notification{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner size={40} />
      ) : filtered.length === 0 ? (
        <NonIdealState
          icon="notifications"
          title="No notifications"
          description={
            notifications.length > 0
              ? "No notifications match the current filters."
              : "You have no notifications yet."
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((notif) => (
            <Card
              key={notif.rid}
              elevation={Elevation.ONE}
              style={{
                padding: "14px 18px",
                opacity: notif.read ? 0.7 : 1,
                borderLeft: `4px solid ${
                  notif.severity === "CRITICAL"
                    ? "#db3737"
                    : notif.severity === "ERROR"
                      ? "#db3737"
                      : notif.severity === "WARNING"
                        ? "#d9822b"
                        : "#2b95d6"
                }`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <Tag intent={SEVERITY_INTENT[notif.severity]} large>
                      {notif.severity}
                    </Tag>
                    {!notif.read && (
                      <Tag minimal intent={Intent.PRIMARY}>
                        NEW
                      </Tag>
                    )}
                  </div>
                  <p style={{ margin: "0 0 6px", fontWeight: notif.read ? 400 : 600 }}>
                    {notif.message}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      fontSize: "0.82rem",
                      color: "#5c7080",
                    }}
                  >
                    <span>
                      Monitor: <strong>{notif.monitorName}</strong>
                    </span>
                    <span>{new Date(notif.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {!notif.read && (
                  <Button
                    minimal
                    small
                    icon="tick"
                    text="Mark Read"
                    onClick={() => handleMarkRead(notif.rid)}
                  />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
