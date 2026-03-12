import type { EffectDef } from "../store/monitor-store.js";
import type { EffectResult } from "../store/execution-log.js";
import type { NotificationStore } from "../store/notification-store.js";
import {
  executeWebhookEffect,
  type WebhookEffectConfig,
  type WebhookEffectContext,
} from "./webhook-effect.js";
import {
  executeActionEffect,
  type ActionEffectConfig,
} from "./action-effect.js";
import {
  executeNotificationEffect,
  type NotificationEffectConfig,
  type NotificationEffectContext,
} from "./notification-effect.js";
import {
  executeLogEffect,
  type LogEffectConfig,
  type LogEffectContext,
} from "./log-effect.js";

// ---------------------------------------------------------------------------
// Shared context passed to every effect execution
// ---------------------------------------------------------------------------

export interface EffectExecutionContext {
  monitorRid: string;
  triggerType: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EffectExecutor — dispatches effects by type
// ---------------------------------------------------------------------------

export class EffectExecutor {
  constructor(private readonly notificationStore: NotificationStore) {}

  /**
   * Execute a single effect definition and return the result.
   */
  async executeEffect(
    effect: EffectDef,
    context: EffectExecutionContext,
  ): Promise<EffectResult> {
    switch (effect.type) {
      case "WEBHOOK":
        return executeWebhookEffect(
          effect.config as unknown as WebhookEffectConfig,
          context as WebhookEffectContext,
        );

      case "ACTION":
        return executeActionEffect(
          effect.config as unknown as ActionEffectConfig,
        );

      case "NOTIFICATION":
        return executeNotificationEffect(
          effect.config as unknown as NotificationEffectConfig,
          context as NotificationEffectContext,
          this.notificationStore,
        );

      case "LOG":
        return executeLogEffect(
          effect.config as unknown as LogEffectConfig,
          context as LogEffectContext,
        );

      default:
        return {
          effectType: (effect as EffectDef).type,
          status: "FAILURE",
          detail: `Unknown effect type: ${(effect as EffectDef).type}`,
        };
    }
  }

  /**
   * Execute all effects for a monitor and collect results.
   */
  async executeAll(
    effects: EffectDef[],
    context: EffectExecutionContext,
  ): Promise<EffectResult[]> {
    const results: EffectResult[] = [];
    for (const effect of effects) {
      const result = await this.executeEffect(effect, context);
      results.push(result);
    }
    return results;
  }
}
