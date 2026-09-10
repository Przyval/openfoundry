/**
 * Email Effect — sends email via Resend API.
 *
 * Uses raw fetch() to call Resend REST API.
 * No npm dependency needed.
 */

import type { EffectResult } from "../store/execution-log.js";
import type { EffectExecutionContext } from "./effect-executor.js";
import { buildDigestHtml } from "./digest-template.js";

export interface EmailEffectConfig {
  recipients: string[];
  subject: string;
  templateType: "digest" | "alert";
  fromEmail?: string;
  fromName?: string;
}

export async function executeEmailEffect(
  config: EmailEffectConfig,
  context: EffectExecutionContext,
): Promise<EffectResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      effectType: "EMAIL",
      status: "FAILURE",
      detail: "RESEND_API_KEY not configured",
    };
  }

  const recipients = config.recipients.length > 0
    ? config.recipients
    : (process.env.DIGEST_RECIPIENTS ?? "").split(",").filter(Boolean);

  if (recipients.length === 0) {
    return {
      effectType: "EMAIL",
      status: "FAILURE",
      detail: "No recipients configured. Set DIGEST_RECIPIENTS env var.",
    };
  }

  let html: string;

  if (config.templateType === "digest") {
    const objectsUrl = process.env.OBJECTS_SERVICE_URL ?? "http://localhost:8082";
    html = await buildDigestHtml(objectsUrl);
  } else {
    // Alert email — simple format from context data
    const message = (context.data?.message as string) ?? "Alert triggered";
    html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #DB3737;">OpenFoundry Alert</h2>
        <p style="font-size: 16px; color: #333;">${message}</p>
        <p style="font-size: 12px; color: #999;">Triggered at ${context.timestamp}</p>
      </div>
    `;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${config.fromName ?? "OpenFoundry"} <${config.fromEmail ?? "alerts@openfoundry.com"}>`,
        to: recipients,
        subject: config.subject,
        html,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { id: string };
      return {
        effectType: "EMAIL",
        status: "SUCCESS",
        detail: `Email sent to ${recipients.join(", ")} (id: ${data.id})`,
      };
    }

    const err = await res.text();
    return {
      effectType: "EMAIL",
      status: "FAILURE",
      detail: `Resend API error ${res.status}: ${err}`,
    };
  } catch (err) {
    return {
      effectType: "EMAIL",
      status: "FAILURE",
      detail: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
