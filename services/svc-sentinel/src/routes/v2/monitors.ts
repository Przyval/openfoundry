import type { FastifyInstance } from "fastify";
import type { MonitorStore, TriggerDef, EffectDef } from "../../store/monitor-store.js";
import type { ExecutionLog } from "../../store/execution-log.js";
import type { EffectExecutor } from "../../effects/effect-executor.js";

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

function paginate<T>(items: T[], query: { pageSize?: string; pageToken?: string }) {
  const pageSize = Math.min(Math.max(parseInt(query.pageSize ?? "100", 10) || 100, 1), 1000);
  const offset = query.pageToken ? parseInt(query.pageToken, 10) || 0 : 0;
  const slice = items.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize;
  return {
    data: slice,
    ...(nextOffset < items.length ? { nextPageToken: String(nextOffset) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function monitorRoutes(
  app: FastifyInstance,
  opts: { monitorStore: MonitorStore; executionLog: ExecutionLog; effectExecutor: EffectExecutor },
): Promise<void> {
  const { monitorStore, executionLog, effectExecutor } = opts;

  // List monitors
  app.get<{
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/monitors", async (request) => {
    const all = monitorStore.listMonitors();
    return paginate(all, request.query);
  });

  // Create monitor
  app.post<{
    Body: {
      name: string;
      description?: string;
      objectType: string;
      trigger: TriggerDef;
      effects: EffectDef[];
    };
  }>("/monitors", async (request, reply) => {
    const monitor = monitorStore.createMonitor(request.body);
    reply.status(201);
    return monitor;
  });

  // Get monitor
  app.get<{
    Params: { monitorRid: string };
  }>("/monitors/:monitorRid", async (request) => {
    return monitorStore.getMonitor(request.params.monitorRid);
  });

  // Update monitor
  app.put<{
    Params: { monitorRid: string };
    Body: {
      name?: string;
      description?: string;
      objectType?: string;
      trigger?: TriggerDef;
      effects?: EffectDef[];
      status?: "ACTIVE" | "PAUSED" | "ERROR";
    };
  }>("/monitors/:monitorRid", async (request) => {
    return monitorStore.updateMonitor(request.params.monitorRid, request.body);
  });

  // Delete monitor
  app.delete<{
    Params: { monitorRid: string };
  }>("/monitors/:monitorRid", async (request, reply) => {
    monitorStore.deleteMonitor(request.params.monitorRid);
    reply.status(204);
    return;
  });

  // Manually trigger monitor
  app.post<{
    Params: { monitorRid: string };
    Body: { triggerData?: Record<string, unknown> };
  }>("/monitors/:monitorRid/trigger", async (request) => {
    const monitor = monitorStore.triggerMonitor(request.params.monitorRid);

    if (monitor.status === "PAUSED") {
      return { message: "Monitor is paused, trigger skipped", monitor };
    }

    const execution = executionLog.startExecution(
      monitor.rid,
      request.body?.triggerData,
    );

    try {
      const effectResults = await effectExecutor.executeAll(monitor.effects, {
        monitorRid: monitor.rid,
        triggerType: monitor.trigger.type,
        timestamp: new Date().toISOString(),
        data: request.body?.triggerData,
      });
      executionLog.completeExecution(execution.rid, effectResults);
      return executionLog.getExecution(execution.rid);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      executionLog.failExecution(execution.rid, errorMsg);
      return executionLog.getExecution(execution.rid);
    }
  });

  // List executions for a monitor
  app.get<{
    Params: { monitorRid: string };
    Querystring: { pageSize?: string; pageToken?: string };
  }>("/monitors/:monitorRid/executions", async (request) => {
    // Verify monitor exists
    monitorStore.getMonitor(request.params.monitorRid);
    const executions = executionLog.listExecutions(request.params.monitorRid);
    return paginate(executions, request.query);
  });
}
