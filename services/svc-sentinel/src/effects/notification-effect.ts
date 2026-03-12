import type { EffectResult } from "../store/execution-log.js";
import type { NotificationStore, StoredNotification } from "../store/notification-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationEffectConfig {
  /** Human-readable notification message. */
  message: string;
  /** Severity level. */
  severity?: "INFO" | "WARN" | "ERROR" | "CRITICAL";
}

export interface NotificationEffectContext {
  monitorRid: string;
}

// ---------------------------------------------------------------------------
// Execute notification effect
// ---------------------------------------------------------------------------

/**
 * Store a notification in the in-memory notification store.
 */
export function executeNotificationEffect(
  config: NotificationEffectConfig,
  context: NotificationEffectContext,
  notificationStore: NotificationStore,
): EffectResult {
  const notification: Omit<StoredNotification, "rid"> = {
    monitorRid: context.monitorRid,
    message: config.message,
    severity: config.severity ?? "INFO",
    createdAt: new Date().toISOString(),
    read: false,
  };

  notificationStore.addNotification(notification);

  return {
    effectType: "NOTIFICATION",
    status: "SUCCESS",
    detail: `Notification stored: "${config.message}"`,
  };
}
