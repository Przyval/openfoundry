import type { FastifyInstance } from "fastify";

interface HealthResponse {
  status: "HEALTHY";
}

const HEALTHY_RESPONSE: HealthResponse = { status: "HEALTHY" } as const;

/**
 * Health-check routes mounted at `/status/*`.
 *
 * - `/status/health`    — general health check
 * - `/status/liveness`  — k8s liveness probe
 * - `/status/readiness` — k8s readiness probe
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthResponse }>("/status/health", async () => {
    return HEALTHY_RESPONSE;
  });

  app.get<{ Reply: HealthResponse }>("/status/liveness", async () => {
    return HEALTHY_RESPONSE;
  });

  app.get<{ Reply: HealthResponse }>("/status/readiness", async () => {
    return HEALTHY_RESPONSE;
  });
}
