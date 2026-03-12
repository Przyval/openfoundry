import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | "object.created"
  | "object.updated"
  | "object.deleted"
  | "action.executed"
  | "ontology.modified";

export interface StoredWebhook {
  rid: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  status: "ACTIVE" | "PAUSED" | "FAILED";
  createdAt: string;
  updatedAt: string;
  failureCount: number;
  lastDeliveryAt?: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  secret?: string;
  events?: WebhookEvent[];
  status?: "ACTIVE" | "PAUSED" | "FAILED";
}

// ---------------------------------------------------------------------------
// WebhookStore — in-memory storage for webhook registrations
// ---------------------------------------------------------------------------

export class WebhookStore {
  private readonly webhooks = new Map<string, StoredWebhook>();

  createWebhook(input: CreateWebhookInput): StoredWebhook {
    // Check for duplicate name
    for (const wh of this.webhooks.values()) {
      if (wh.name === input.name) {
        throw conflict("Webhook", `name "${input.name}" already exists`);
      }
    }

    const now = new Date().toISOString();
    const rid = generateRid("webhooks", "webhook").toString();
    const webhook: StoredWebhook = {
      rid,
      name: input.name,
      url: input.url,
      secret: input.secret,
      events: input.events,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
      failureCount: 0,
    };

    this.webhooks.set(rid, webhook);
    return webhook;
  }

  getWebhook(rid: string): StoredWebhook {
    const webhook = this.webhooks.get(rid);
    if (!webhook) {
      throw notFound("Webhook", rid);
    }
    return webhook;
  }

  listWebhooks(): StoredWebhook[] {
    return Array.from(this.webhooks.values());
  }

  updateWebhook(rid: string, input: UpdateWebhookInput): StoredWebhook {
    const webhook = this.getWebhook(rid);
    const updated: StoredWebhook = {
      ...webhook,
      name: input.name ?? webhook.name,
      url: input.url ?? webhook.url,
      secret: input.secret !== undefined ? input.secret : webhook.secret,
      events: input.events ?? webhook.events,
      status: input.status ?? webhook.status,
      updatedAt: new Date().toISOString(),
    };
    this.webhooks.set(rid, updated);
    return updated;
  }

  deleteWebhook(rid: string): void {
    if (!this.webhooks.has(rid)) {
      throw notFound("Webhook", rid);
    }
    this.webhooks.delete(rid);
  }

  getWebhooksForEvent(event: WebhookEvent): StoredWebhook[] {
    return Array.from(this.webhooks.values()).filter(
      (wh) => wh.status === "ACTIVE" && wh.events.includes(event),
    );
  }

  /** Update delivery tracking fields on a webhook. */
  markDelivery(rid: string, success: boolean): void {
    const webhook = this.webhooks.get(rid);
    if (!webhook) return;
    webhook.lastDeliveryAt = new Date().toISOString();
    if (!success) {
      webhook.failureCount += 1;
      if (webhook.failureCount >= 10) {
        webhook.status = "FAILED";
      }
    } else {
      webhook.failureCount = 0;
    }
  }
}
