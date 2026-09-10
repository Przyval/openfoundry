import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "../../config.js";
import { datasetRoutesV1 } from "./datasets.js";
import { ontologyRoutesV1 } from "./ontologies.js";

// ---------------------------------------------------------------------------
// v1 route registration
// ---------------------------------------------------------------------------

export interface V1RouteOptions {
  config: GatewayConfig;
}

/**
 * Registers the `/api/v1/*` route groups.
 *
 * v1 has two top-level namespaces the backends serve — `datasets` and
 * `ontologies`. `attachments`, the third in the reference API, has no backend
 * and is deliberately not proxied: a prefix registered here would answer 502
 * rather than the 404 a caller should get for an operation that does not exist.
 */
export async function v1Routes(
  app: FastifyInstance,
  options: V1RouteOptions,
): Promise<void> {
  if (!app.hasDecorator("config")) {
    app.decorate("config", options.config);
  }

  await app.register(datasetRoutesV1, { prefix: "/datasets" });
  await app.register(ontologyRoutesV1, { prefix: "/ontologies" });
}
