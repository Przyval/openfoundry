import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookDelivery {
  rid: string;
  webhookRid: string;
  event: string;
  payload: unknown;
  status: "PENDING" | "DELIVERED" | "FAILED";
  statusCode?: number;
  attempts: number;
  createdAt: string;
  deliveredAt?: string;
}

// ---------------------------------------------------------------------------
// DeliveryLog — in-memory storage for webhook delivery records
// ---------------------------------------------------------------------------

export class DeliveryLog {
  private readonly deliveries = new Map<string, WebhookDelivery>();

  logDelivery(webhookRid: string, event: string, payload: unknown): WebhookDelivery {
    const rid = generateRid("webhooks", "delivery").toString();
    const delivery: WebhookDelivery = {
      rid,
      webhookRid,
      event,
      payload,
      status: "PENDING",
      attempts: 0,
      createdAt: new Date().toISOString(),
    };
    this.deliveries.set(rid, delivery);
    return delivery;
  }

  getDelivery(rid: string): WebhookDelivery {
    const delivery = this.deliveries.get(rid);
    if (!delivery) {
      throw notFound("WebhookDelivery", rid);
    }
    return delivery;
  }

  listDeliveries(webhookRid?: string): WebhookDelivery[] {
    const all = Array.from(this.deliveries.values());
    if (webhookRid) {
      return all.filter((d) => d.webhookRid === webhookRid);
    }
    return all;
  }

  markDelivered(rid: string, statusCode: number): WebhookDelivery {
    const delivery = this.getDelivery(rid);
    delivery.status = "DELIVERED";
    delivery.statusCode = statusCode;
    delivery.attempts += 1;
    delivery.deliveredAt = new Date().toISOString();
    return delivery;
  }

  markFailed(rid: string, statusCode?: number): WebhookDelivery {
    const delivery = this.getDelivery(rid);
    delivery.status = "FAILED";
    delivery.statusCode = statusCode;
    delivery.attempts += 1;
    return delivery;
  }

  incrementAttempts(rid: string): void {
    const delivery = this.deliveries.get(rid);
    if (delivery) {
      delivery.attempts += 1;
    }
  }
}
