import type { FastifyInstance } from "fastify";
import type { CompassStore } from "../../store/compass-store.js";
import type { LineageStore } from "../../store/lineage-store.js";
import { resourceRoutes } from "./resources.js";
import { lineageRoutes } from "./lineage-routes.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: { store: CompassStore; lineageStore: LineageStore },
): Promise<void> {
  await app.register(resourceRoutes, { store: opts.store });
  await app.register(lineageRoutes, { lineageStore: opts.lineageStore });
}
