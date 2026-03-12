import type { FastifyInstance } from "fastify";
import type { IMediaStore } from "../../store/media-store.js";
import { mediaRoutes } from "./media.js";

export async function v2Routes(
  app: FastifyInstance,
  opts: { store: IMediaStore },
): Promise<void> {
  await app.register(mediaRoutes, { store: opts.store });
}
