import { generateRid } from "@openfoundry/rid";
import { notFound, conflict } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriggerDef {
  type: "OBJECT_CHANGED" | "SCHEDULE" | "PROPERTY_THRESHOLD";
  config: Record<string, unknown>;
}

export interface EffectDef {
  type: "WEBHOOK" | "ACTION" | "NOTIFICATION" | "LOG";
  config: Record<string, unknown>;
}

export interface StoredMonitor {
  rid: string;
  name: string;
  description?: string;
  objectType: string;
  trigger: TriggerDef;
  effects: EffectDef[];
  status: "ACTIVE" | "PAUSED" | "ERROR";
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMonitorInput {
  name: string;
  description?: string;
  objectType: string;
  trigger: TriggerDef;
  effects: EffectDef[];
}

export interface UpdateMonitorInput {
  name?: string;
  description?: string;
  objectType?: string;
  trigger?: TriggerDef;
  effects?: EffectDef[];
  status?: "ACTIVE" | "PAUSED" | "ERROR";
}

// ---------------------------------------------------------------------------
// MonitorStore — in-memory storage for sentinel monitors
// ---------------------------------------------------------------------------

export class MonitorStore {
  private readonly monitors = new Map<string, StoredMonitor>();

  createMonitor(input: CreateMonitorInput): StoredMonitor {
    // Check for duplicate name
    for (const mon of this.monitors.values()) {
      if (mon.name === input.name) {
        throw conflict("Monitor", `name "${input.name}" already exists`);
      }
    }

    const now = new Date().toISOString();
    const rid = generateRid("sentinel", "monitor").toString();
    const monitor: StoredMonitor = {
      rid,
      name: input.name,
      description: input.description,
      objectType: input.objectType,
      trigger: input.trigger,
      effects: input.effects,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    this.monitors.set(rid, monitor);
    return monitor;
  }

  getMonitor(rid: string): StoredMonitor {
    const monitor = this.monitors.get(rid);
    if (!monitor) {
      throw notFound("Monitor", rid);
    }
    return monitor;
  }

  listMonitors(): StoredMonitor[] {
    return Array.from(this.monitors.values());
  }

  updateMonitor(rid: string, input: UpdateMonitorInput): StoredMonitor {
    const monitor = this.getMonitor(rid);
    const updated: StoredMonitor = {
      ...monitor,
      name: input.name ?? monitor.name,
      description: input.description !== undefined ? input.description : monitor.description,
      objectType: input.objectType ?? monitor.objectType,
      trigger: input.trigger ?? monitor.trigger,
      effects: input.effects ?? monitor.effects,
      status: input.status ?? monitor.status,
      updatedAt: new Date().toISOString(),
    };
    this.monitors.set(rid, updated);
    return updated;
  }

  deleteMonitor(rid: string): void {
    if (!this.monitors.has(rid)) {
      throw notFound("Monitor", rid);
    }
    this.monitors.delete(rid);
  }

  triggerMonitor(rid: string): StoredMonitor {
    const monitor = this.getMonitor(rid);
    monitor.lastTriggeredAt = new Date().toISOString();
    monitor.updatedAt = monitor.lastTriggeredAt;
    return monitor;
  }
}
