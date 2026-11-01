import type { FastifyInstance } from "fastify";
import { proxyRequest } from "../../proxy.js";

/**
 * Creating a model version uploads the serialized model in the JSON body, so
 * this proxy accepts what svc-aip accepts for it (`MODEL_VERSION_BODY_LIMIT` in
 * `svc-aip/src/routes/v2/models.ts`) rather than Fastify's 1 MiB default.
 */
const MODELS_BODY_LIMIT = 64 * 1024 * 1024;

/**
 * Model routes (the Foundry `models` section) — proxied to svc-aip, which
 * serves Models, Model Versions and Model Studios.
 */
export async function modelRoutes(app: FastifyInstance): Promise<void> {
  app.all("/", async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.aip);
  });

  app.all("/*", { bodyLimit: MODELS_BODY_LIMIT }, async (request, reply) => {
    await proxyRequest(request, reply, app.config.services.aip);
  });
}
