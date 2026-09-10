/**
 * Background Scheduler — evaluates SCHEDULE-type monitors periodically.
 *
 * Runs every 60 seconds. For each active monitor with a SCHEDULE trigger,
 * checks if the cron pattern matches the current minute. If so, fetches
 * data from svc-objects, evaluates conditions, and executes effects.
 */

import type { MonitorStore } from "./store/monitor-store.js";
import type { ExecutionLog } from "./store/execution-log.js";
import type { EffectExecutor } from "./effects/effect-executor.js";
import { DataFetcher, type ThresholdQuery } from "./data-fetcher.js";

export interface SchedulerConfig {
  intervalMs: number;
  objectsServiceUrl: string;
}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly fetcher: DataFetcher;

  constructor(
    private readonly monitorStore: MonitorStore,
    private readonly executionLog: ExecutionLog,
    private readonly effectExecutor: EffectExecutor,
    private readonly config: SchedulerConfig,
  ) {
    this.fetcher = new DataFetcher(config.objectsServiceUrl);
  }

  start(): void {
    if (this.timer) return;
    console.log(`[Scheduler] Starting — checking every ${this.config.intervalMs / 1000}s`);
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref(); // Don't prevent process exit
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[Scheduler] Stopped");
    }
  }

  /**
   * One scheduler tick — evaluate all active SCHEDULE monitors.
   */
  async tick(): Promise<void> {
    const monitors = this.monitorStore.listMonitors().filter(
      (m) => m.status === "ACTIVE" && m.trigger.type === "SCHEDULE",
    );

    if (monitors.length === 0) return;

    const now = new Date();

    for (const monitor of monitors) {
      try {
        const shouldFire = this.shouldFireCron(monitor.trigger.config, now);
        if (!shouldFire) continue;

        // Check threshold condition if present
        const thresholdConfig = monitor.trigger.config as {
          objectType?: string;
          property?: string;
          operator?: string;
          threshold?: number;
        };

        let alertMessage = `Scheduled alert: ${monitor.name}`;
        let violated = true;

        if (thresholdConfig.objectType && thresholdConfig.property && thresholdConfig.threshold !== undefined) {
          const query: ThresholdQuery = {
            objectType: thresholdConfig.objectType,
            property: thresholdConfig.property,
            operator: (thresholdConfig.operator as ThresholdQuery["operator"]) ?? "lt",
            value: thresholdConfig.threshold,
          };
          const result = await this.fetcher.evaluateThreshold(query);
          violated = result.violated;
          if (violated) {
            alertMessage = `${monitor.name}: ${result.matchCount} objects match condition (${query.property} ${query.operator} ${query.value})`;
          }
        }

        if (!violated) continue;

        // Update last triggered
        this.monitorStore.triggerMonitor(monitor.rid);

        // Execute effects
        const context = {
          monitorRid: monitor.rid,
          triggerType: "SCHEDULE",
          timestamp: now.toISOString(),
          data: { message: alertMessage },
        };
        const results = await this.effectExecutor.executeAll(monitor.effects, context);

        // Log execution
        const execution = this.executionLog.startExecution(monitor.rid, {
          triggerType: "SCHEDULE",
          message: alertMessage,
        });
        this.executionLog.completeExecution(execution.rid, results);

        console.log(`[Scheduler] Fired: ${monitor.name} → ${results.length} effects`);
      } catch (err) {
        console.error(`[Scheduler] Error evaluating monitor ${monitor.name}:`, err);
      }
    }
  }

  // Check if a cron config should fire for the given time.
  // Supports: { cron: "star/5 * * * *" } or { intervalMinutes: 5 }
  private shouldFireCron(config: Record<string, unknown>, now: Date): boolean {
    const intervalMin = config.intervalMinutes as number | undefined;
    if (intervalMin) {
      return now.getMinutes() % intervalMin === 0;
    }

    const cron = config.cron as string | undefined;
    if (!cron) return false;

    const parts = cron.split(/\s+/);
    if (parts.length < 5) return false;

    const [minPart, hourPart, domPart, monPart, dowPart] = parts;
    return (
      this.matchCronField(minPart, now.getMinutes()) &&
      this.matchCronField(hourPart, now.getHours()) &&
      this.matchCronField(domPart, now.getDate()) &&
      this.matchCronField(monPart, now.getMonth() + 1) &&
      this.matchCronField(dowPart, now.getDay())
    );
  }

  private matchCronField(pattern: string, value: number): boolean {
    if (pattern === "*") return true;
    if (pattern.startsWith("*/")) {
      const step = parseInt(pattern.slice(2), 10);
      return value % step === 0;
    }
    if (pattern.includes(",")) {
      return pattern.split(",").some((p) => parseInt(p, 10) === value);
    }
    return parseInt(pattern, 10) === value;
  }
}
