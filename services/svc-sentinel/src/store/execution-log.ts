import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitorExecution {
  rid: string;
  monitorRid: string;
  status: "SUCCESS" | "FAILURE" | "RUNNING";
  triggerData?: Record<string, unknown>;
  effectResults: EffectResult[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface EffectResult {
  effectType: string;
  status: "SUCCESS" | "FAILURE";
  detail?: string;
}

// ---------------------------------------------------------------------------
// ExecutionLog — in-memory storage for monitor execution records
// ---------------------------------------------------------------------------

export class ExecutionLog {
  private readonly executions = new Map<string, MonitorExecution>();

  startExecution(monitorRid: string, triggerData?: Record<string, unknown>): MonitorExecution {
    const rid = generateRid("sentinel", "execution").toString();
    const execution: MonitorExecution = {
      rid,
      monitorRid,
      status: "RUNNING",
      triggerData,
      effectResults: [],
      startedAt: new Date().toISOString(),
    };
    this.executions.set(rid, execution);
    return execution;
  }

  completeExecution(rid: string, effectResults: EffectResult[]): MonitorExecution {
    const execution = this.getExecution(rid);
    execution.status = "SUCCESS";
    execution.effectResults = effectResults;
    execution.completedAt = new Date().toISOString();
    return execution;
  }

  failExecution(rid: string, error: string): MonitorExecution {
    const execution = this.getExecution(rid);
    execution.status = "FAILURE";
    execution.error = error;
    execution.completedAt = new Date().toISOString();
    return execution;
  }

  getExecution(rid: string): MonitorExecution {
    const execution = this.executions.get(rid);
    if (!execution) {
      throw notFound("MonitorExecution", rid);
    }
    return execution;
  }

  listExecutions(monitorRid?: string): MonitorExecution[] {
    const all = Array.from(this.executions.values());
    if (monitorRid) {
      return all.filter((e) => e.monitorRid === monitorRid);
    }
    return all;
  }
}
