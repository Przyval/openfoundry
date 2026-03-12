import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredNotification {
  rid: string;
  monitorRid: string;
  message: string;
  severity: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  createdAt: string;
  read: boolean;
}

// ---------------------------------------------------------------------------
// NotificationStore — in-memory storage for sentinel notifications
// ---------------------------------------------------------------------------

export class NotificationStore {
  private readonly notifications = new Map<string, StoredNotification>();

  addNotification(input: Omit<StoredNotification, "rid">): StoredNotification {
    const rid = generateRid("sentinel", "notification").toString();
    const notification: StoredNotification = { rid, ...input };
    this.notifications.set(rid, notification);
    return notification;
  }

  getNotification(rid: string): StoredNotification {
    const notification = this.notifications.get(rid);
    if (!notification) {
      throw notFound("Notification", rid);
    }
    return notification;
  }

  listNotifications(): StoredNotification[] {
    return Array.from(this.notifications.values());
  }

  markRead(rid: string): StoredNotification {
    const notification = this.getNotification(rid);
    notification.read = true;
    return notification;
  }
}
