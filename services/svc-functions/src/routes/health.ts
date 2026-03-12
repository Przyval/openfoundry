import type { FastifyInstance } from "fastify";

interface HealthResponse {
  status: "HEALTHY";
}

const HEALTHY_RESPONSE: HealthResponse = { status: "HEALTHY" } as const;

/**
 * Health-check routes mounted at `/status/*`.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthResponse }>(
    "/status/health",
    async (_request, _reply) => {
      return HEALTHY_RESPONSE;
    },
  );

  app.get<{ Reply: HealthResponse }>(
    "/status/liveness",
    async (_request, _reply) => {
      return HEALTHY_RESPONSE;
    },
  );

  app.get<{ Reply: HealthResponse }>(
    "/status/readiness",
    async (_request, _reply) => {
      return HEALTHY_RESPONSE;
    },
  );
}
