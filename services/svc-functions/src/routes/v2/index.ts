import type { FastifyInstance } from "fastify";
import type { FunctionStore } from "../../store/function-store.js";
import { functionRoutes } from "./functions.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: { store: FunctionStore },
): Promise<void> {
  await app.register(functionRoutes, { store: opts.store });
}
