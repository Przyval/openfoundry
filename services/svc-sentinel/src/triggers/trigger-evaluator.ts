import type { TriggerDef } from "../store/monitor-store.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriggerContext {
  /** Current timestamp for schedule evaluation. */
  now?: Date;
  /** Previous object state (for OBJECT_CHANGED). */
  oldObject?: Record<string, unknown>;
  /** Current object state (for OBJECT_CHANGED). */
  newObject?: Record<string, unknown>;
  /** Current numeric value (for PROPERTY_THRESHOLD). */
  currentValue?: number;
}

export interface TriggerEvaluationResult {
  fired: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Schedule evaluation
// ---------------------------------------------------------------------------

interface ScheduleConfig {
  /** Cron-like pattern: "minute hour dayOfMonth month dayOfWeek" */
  cron?: string;
  /** Interval in minutes (simpler alternative to cron). */
  intervalMinutes?: number;
}

function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;

  // Handle lists: "1,5,10"
  if (field.includes(",")) {
    return field.split(",").some((f) => matchesCronField(f.trim(), value));
  }

  // Handle step: "*/5"
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Handle range: "1-5"
  if (field.includes("-")) {
    const [minStr, maxStr] = field.split("-");
    const min = parseInt(minStr, 10);
    const max = parseInt(maxStr, 10);
    return !isNaN(min) && !isNaN(max) && value >= min && value <= max;
  }

  // Exact match
  return parseInt(field, 10) === value;
}

function evaluateSchedule(
  config: ScheduleConfig,
  now: Date,
): TriggerEvaluationResult {
  if (config.cron) {
    const parts = config.cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      return { fired: false, reason: "Invalid cron pattern: expected 5 fields" };
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const matches =
      matchesCronField(minute, now.getUTCMinutes()) &&
      matchesCronField(hour, now.getUTCHours()) &&
      matchesCronField(dayOfMonth, now.getUTCDate()) &&
      matchesCronField(month, now.getUTCMonth() + 1) &&
      matchesCronField(dayOfWeek, now.getUTCDay());

    return matches
      ? { fired: true, reason: `Cron pattern "${config.cron}" matched` }
      : { fired: false, reason: `Cron pattern "${config.cron}" did not match` };
  }

  if (config.intervalMinutes) {
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
    const matches = minuteOfDay % config.intervalMinutes === 0;
    return matches
      ? { fired: true, reason: `Interval ${config.intervalMinutes}m matched` }
      : { fired: false, reason: `Interval ${config.intervalMinutes}m did not match` };
  }

  return { fired: false, reason: "No schedule pattern configured" };
}

// ---------------------------------------------------------------------------
// Object changed evaluation
// ---------------------------------------------------------------------------

interface ObjectChangedConfig {
  /** Property names to watch for changes. */
  properties: string[];
}

function evaluateObjectChanged(
  config: ObjectChangedConfig,
  oldObject?: Record<string, unknown>,
  newObject?: Record<string, unknown>,
): TriggerEvaluationResult {
  if (!oldObject || !newObject) {
    return { fired: false, reason: "Missing old or new object state" };
  }

  const changedProperties: string[] = [];

  for (const prop of config.properties) {
    const oldVal = oldObject[prop];
    const newVal = newObject[prop];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changedProperties.push(prop);
    }
  }

  if (changedProperties.length > 0) {
    return {
      fired: true,
      reason: `Properties changed: ${changedProperties.join(", ")}`,
    };
  }

  return { fired: false, reason: "No watched properties changed" };
}

// ---------------------------------------------------------------------------
// Threshold evaluation
// ---------------------------------------------------------------------------

interface ThresholdConfig {
  /** The threshold value. */
  threshold: number;
  /** Direction: fire when value crosses above or below the threshold. */
  direction: "ABOVE" | "BELOW";
}

function evaluateThreshold(
  config: ThresholdConfig,
  currentValue?: number,
): TriggerEvaluationResult {
  if (currentValue === undefined || currentValue === null) {
    return { fired: false, reason: "No current value provided" };
  }

  if (config.direction === "ABOVE" && currentValue > config.threshold) {
    return {
      fired: true,
      reason: `Value ${currentValue} exceeds threshold ${config.threshold}`,
    };
  }

  if (config.direction === "BELOW" && currentValue < config.threshold) {
    return {
      fired: true,
      reason: `Value ${currentValue} is below threshold ${config.threshold}`,
    };
  }

  return {
    fired: false,
    reason: `Value ${currentValue} does not cross threshold ${config.threshold} (${config.direction})`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a trigger definition should fire given the context.
 */
export function evaluateTrigger(
  trigger: TriggerDef,
  context: TriggerContext = {},
): TriggerEvaluationResult {
  const now = context.now ?? new Date();

  switch (trigger.type) {
    case "SCHEDULE":
      return evaluateSchedule(trigger.config as unknown as ScheduleConfig, now);

    case "OBJECT_CHANGED":
      return evaluateObjectChanged(
        trigger.config as unknown as ObjectChangedConfig,
        context.oldObject,
        context.newObject,
      );

    case "PROPERTY_THRESHOLD":
      return evaluateThreshold(
        trigger.config as unknown as ThresholdConfig,
        context.currentValue,
      );

    default:
      return { fired: false, reason: `Unknown trigger type: ${trigger.type}` };
  }
}
