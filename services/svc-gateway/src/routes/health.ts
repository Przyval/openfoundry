import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

interface HealthResponse {
  status: "HEALTHY";
}

const HEALTHY_RESPONSE: HealthResponse = { status: "HEALTHY" } as const;

/**
 * The list of backend services whose /metrics endpoints can be proxied
 * through the gateway at /metrics/:service.
 */
const METRICS_SERVICES: Record<string, string> = {
  multipass: "MULTIPASS_SERVICE_URL",
  ontology: "ONTOLOGY_SERVICE_URL",
  objects: "OBJECTS_SERVICE_URL",
  actions: "ACTIONS_SERVICE_URL",
  datasets: "DATASETS_SERVICE_URL",
  compass: "COMPASS_SERVICE_URL",
  admin: "ADMIN_SERVICE_URL",
  functions: "FUNCTIONS_SERVICE_URL",
  webhooks: "WEBHOOKS_SERVICE_URL",
  media: "MEDIA_SERVICE_URL",
  sentinel: "SENTINEL_SERVICE_URL",
  aip: "AIP_SERVICE_URL",
};

/**
 * Health-check routes mounted at `/status/*`.
 *
 * These endpoints are excluded from authentication and are intended
 * for load balancers, orchestrators, and monitoring systems.
 *
 * - `/status/health`    — general health check
 * - `/status/liveness`  — k8s liveness probe (is the process alive?)
 * - `/status/readiness` — k8s readiness probe (can the process accept traffic?)
 *
 * Metrics routes:
 * - `/metrics`          — gateway's own Prometheus metrics
 * - `/metrics/:service` — proxy to a downstream service's /metrics endpoint
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthResponse }>("/status/health", async (_request, _reply) => {
    return HEALTHY_RESPONSE;
  });

  app.get<{ Reply: HealthResponse }>("/status/liveness", async (_request, _reply) => {
    return HEALTHY_RESPONSE;
  });

  app.get<{ Reply: HealthResponse }>("/status/readiness", async (_request, _reply) => {
    // In the future this can check downstream dependencies (DB, services)
    // and return 503 if they are unreachable.
    return HEALTHY_RESPONSE;
  });

  // -------------------------------------------------------------------------
  // Metrics: proxy to downstream services
  // Note: GET /metrics is registered by the metricsPlugin from @openfoundry/health
  // -------------------------------------------------------------------------
  app.get<{ Params: { service: string } }>(
    "/metrics/:service",
    async (request: FastifyRequest<{ Params: { service: string } }>, reply: FastifyReply) => {
      const { service } = request.params;

      const envVar = METRICS_SERVICES[service];
      if (!envVar) {
        reply.code(404).send({
          errorCode: "NOT_FOUND",
          errorName: "ServiceNotFound",
          errorInstanceId: crypto.randomUUID(),
          parameters: { service },
          statusCode: 404,
        });
        return;
      }

      const baseUrl = process.env[envVar];
      if (!baseUrl) {
        reply.code(503).send({
          errorCode: "SERVICE_UNAVAILABLE",
          errorName: "ServiceNotConfigured",
          errorInstanceId: crypto.randomUUID(),
          parameters: { service },
          statusCode: 503,
        });
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${baseUrl}/metrics`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const body = await response.text();
        reply
          .code(response.status)
          .type("text/plain; version=0.0.4; charset=utf-8")
          .send(body);
      } catch (err) {
        request.log.error(
          { err, service, target: `${baseUrl}/metrics` },
          "Failed to fetch metrics from downstream service",
        );
        reply.code(502).send({
          errorCode: "BAD_GATEWAY",
          errorName: "MetricsFetchFailed",
          errorInstanceId: crypto.randomUUID(),
          parameters: { service },
          statusCode: 502,
        });
      }
    },
  );
}
