import type { EffectResult } from "../store/execution-log.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEffectConfig {
  /** Log message template. */
  message: string;
  /** Log level (default "info"). */
  level?: "debug" | "info" | "warn" | "error";
}

export interface LogEffectContext {
  monitorRid: string;
  triggerType: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Execute log effect
// ---------------------------------------------------------------------------

/**
 * Write a structured log entry via console.
 */
export function executeLogEffect(
  config: LogEffectConfig,
  context: LogEffectContext,
): EffectResult {
  const level = config.level ?? "info";
  const entry = {
    source: "svc-sentinel",
    monitorRid: context.monitorRid,
    triggerType: context.triggerType,
    timestamp: context.timestamp,
    message: config.message,
    data: context.data,
  };

  switch (level) {
    case "debug":
      console.debug(JSON.stringify(entry));
      break;
    case "warn":
      console.warn(JSON.stringify(entry));
      break;
    case "error":
      console.error(JSON.stringify(entry));
      break;
    case "info":
    default:
      console.info(JSON.stringify(entry));
      break;
  }

  return {
    effectType: "LOG",
    status: "SUCCESS",
    detail: `Log written: "${config.message}"`,
  };
}
