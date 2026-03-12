import { createHmac } from "node:crypto";
import type { EffectResult } from "../store/execution-log.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookEffectConfig {
  /** Target URL to POST to. */
  url: string;
  /** Optional HMAC-SHA256 secret for signing the payload. */
  secret?: string;
  /** Request timeout in milliseconds (default 10 000). */
  timeoutMs?: number;
}

export interface WebhookEffectContext {
  monitorRid: string;
  triggerType: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function isRetryable(status: number): boolean {
  return status >= 500 && status < 600;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Execute webhook effect
// ---------------------------------------------------------------------------

/**
 * POST a JSON payload to the configured webhook URL.
 *
 * - Signs the body with HMAC-SHA256 when a secret is provided.
 * - Retries up to {@link MAX_RETRIES} times on 5xx responses (1 s delay).
 * - Returns an {@link EffectResult} indicating success or failure.
 */
export async function executeWebhookEffect(
  config: WebhookEffectConfig,
  context: WebhookEffectContext,
): Promise<EffectResult> {
  const body = JSON.stringify({
    monitorRid: context.monitorRid,
    triggerType: context.triggerType,
    timestamp: context.timestamp,
    data: context.data ?? {},
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.secret) {
    headers["X-OpenFoundry-Signature"] = `sha256=${signPayload(body, config.secret)}`;
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        return {
          effectType: "WEBHOOK",
          status: "SUCCESS",
          detail: `Webhook delivered, HTTP ${response.status}`,
        };
      }

      lastStatus = response.status;
      lastError = `HTTP ${response.status}`;

      // Only retry on 5xx
      if (!isRetryable(response.status)) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Wait before next retry (skip delay after last attempt)
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  return {
    effectType: "WEBHOOK",
    status: "FAILURE",
    detail: lastStatus
      ? `Webhook failed after ${MAX_RETRIES + 1} attempts: ${lastError}`
      : `Webhook failed: ${lastError}`,
  };
}
