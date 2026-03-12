import type { FastifyInstance } from "fastify";

interface HealthResponse {
  status: "HEALTHY";
}

const HEALTHY_RESPONSE: HealthResponse = { status: "HEALTHY" } as const;

/**
 * Health-check routes mounted at `/status/*`.
 *
 * These endpoints are excluded from authentication and are intended
 * for load balancers, orchestrators, and monitoring systems.
 *
 * - `/status/health`    — general health check
 * - `/status/liveness`  — k8s liveness probe (is the process alive?)
 * - `/status/readiness` — k8s readiness probe (can the process accept traffic?)
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthResponse }>("/status/health", async (_request, _reply) => {
    return HEALTHY_RESPONSE;
  });

  app.get<{ Reply: HealthResponse }>("/status/liveness", async (_request, _reply) => {
    return HEALTHY_RESPONSE;
  });

  app.get<{ Reply: HealthResponse }>("/status/readiness", async (_request, _reply) => {
    return HEALTHY_RESPONSE;
  });
}
