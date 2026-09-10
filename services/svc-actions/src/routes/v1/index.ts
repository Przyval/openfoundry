import type { FastifyInstance } from "fastify";
import type { ActionRegistry } from "../../store/action-registry.js";
import type { ActionLog } from "../../store/action-log.js";
import { actionRoutesV1 } from "./actions.js";

/**
 * The `/api/v1` action surface.
 *
 * Applies the same registered actions as the v2 routes, but every one of the
 * three response models differs: v1 `ApplyActionResponse` and
 * `BatchApplyActionResponse` are empty objects, and `ValidateActionResponse` is
 * a per-parameter evaluation rather than a list of error strings.
 */
export async function v1Routes(
  app: FastifyInstance,
  opts: { registry: ActionRegistry; log: ActionLog },
): Promise<void> {
  // Rebuilt rather than passed through: `opts` still carries this plugin's own
  // `prefix`, which would otherwise be applied a second time.
  await app.register(actionRoutesV1, { registry: opts.registry, log: opts.log });
}
