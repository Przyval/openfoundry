import type { FastifyInstance } from "fastify";
import type { MonitorStore } from "../../store/monitor-store.js";
import type { ExecutionLog } from "../../store/execution-log.js";
import type { NotificationStore } from "../../store/notification-store.js";
import type { EffectExecutor } from "../../effects/effect-executor.js";
import { monitorRoutes } from "./monitors.js";
import { notificationRoutes } from "./notifications.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: {
    monitorStore: MonitorStore;
    executionLog: ExecutionLog;
    notificationStore: NotificationStore;
    effectExecutor: EffectExecutor;
  },
): Promise<void> {
  await app.register(monitorRoutes, {
    monitorStore: opts.monitorStore,
    executionLog: opts.executionLog,
    effectExecutor: opts.effectExecutor,
  });
  await app.register(notificationRoutes, {
    notificationStore: opts.notificationStore,
  });
}
