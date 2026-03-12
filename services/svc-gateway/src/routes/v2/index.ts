import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../../config.js";
import { ontologyRoutes } from "./ontologies.js";
import { objectRoutes } from "./objects.js";
import { actionRoutes } from "./actions.js";
import { datasetRoutes } from "./datasets.js";
import { compassRoutes } from "./compass.js";
import { adminRoutes } from "./admin.js";
import { functionRoutes } from "./functions.js";
import { webhookRoutes } from "./webhooks.js";
import { mediaRoutes } from "./media.js";
import { monitorRoutes } from "./monitors.js";
import { notificationRoutes } from "./notifications.js";
import { pipelineRoutes } from "./pipelines.js";
import { searchRoutes } from "./search.js";
import { aipRoutes } from "./aip.js";

// ---------------------------------------------------------------------------
// v2 route registration
// ---------------------------------------------------------------------------

export interface V2RouteOptions {
  config: GatewayConfig;
}

/**
 * Registers all `/api/v2/*` route groups.
 *
 * Each route group proxies to its corresponding backend service.
 */
export async function v2Routes(
  app: FastifyInstance,
  options: V2RouteOptions,
): Promise<void> {
  // Decorate the instance so child route plugins can access config.
  if (!app.hasDecorator("config")) {
    app.decorate("config", options.config);
  }

  await app.register(ontologyRoutes, { prefix: "/ontologies" });
  await app.register(objectRoutes, { prefix: "/objects" });
  await app.register(actionRoutes, { prefix: "/actions" });
  await app.register(datasetRoutes, { prefix: "/datasets" });
  await app.register(compassRoutes, { prefix: "/compass" });
  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(functionRoutes, { prefix: "/functions" });
  await app.register(webhookRoutes, { prefix: "/webhooks" });
  await app.register(mediaRoutes, { prefix: "/media" });
  await app.register(monitorRoutes, { prefix: "/monitors" });
  await app.register(notificationRoutes, { prefix: "/notifications" });
  await app.register(pipelineRoutes, { prefix: "/pipelines" });
  await app.register(searchRoutes, { prefix: "/search" });
  await app.register(aipRoutes, { prefix: "/aip" });
}
