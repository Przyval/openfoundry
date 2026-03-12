import { createHmac } from "node:crypto";
import type { StoredWebhook } from "./store/webhook-store.js";
import type { WebhookDelivery, DeliveryLog } from "./store/delivery-log.js";
import type { WebhookStore } from "./store/webhook-store.js";

// ---------------------------------------------------------------------------
// Delivery engine
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

/**
 * Sign a payload using HMAC-SHA256 with the webhook's secret.
 */
function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Deliver a webhook event to the registered URL.
 *
 * Signs the payload with HMAC-SHA256 using webhook.secret (if present).
 * Sets headers: X-OpenFoundry-Event, X-OpenFoundry-Signature, X-OpenFoundry-Delivery.
 * Retries up to 3 times with exponential backoff.
 */
export async function deliverWebhook(
  webhook: StoredWebhook,
  event: string,
  payload: unknown,
  deliveryLog: DeliveryLog,
  webhookStore: WebhookStore,
): Promise<WebhookDelivery> {
  const delivery = deliveryLog.logDelivery(webhook.rid, event, payload);
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-OpenFoundry-Event": event,
    "X-OpenFoundry-Delivery": delivery.rid,
  };

  if (webhook.secret) {
    headers["X-OpenFoundry-Signature"] = `sha256=${signPayload(body, webhook.secret)}`;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        deliveryLog.markDelivered(delivery.rid, response.status);
        webhookStore.markDelivery(webhook.rid, true);
        return deliveryLog.getDelivery(delivery.rid);
      }

      lastError = new Error(`HTTP ${response.status}`);
      deliveryLog.incrementAttempts(delivery.rid);
    } catch (err) {
      lastError = err;
      deliveryLog.incrementAttempts(delivery.rid);
    }

    // Exponential backoff before retry
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, BASE_BACKOFF_MS * Math.pow(2, attempt)),
      );
    }
  }

  // All retries exhausted
  const statusCode = lastError instanceof Error && lastError.message.startsWith("HTTP ")
    ? parseInt(lastError.message.split(" ")[1], 10)
    : undefined;

  deliveryLog.markFailed(delivery.rid, statusCode);
  webhookStore.markDelivery(webhook.rid, false);
  return deliveryLog.getDelivery(delivery.rid);
}
