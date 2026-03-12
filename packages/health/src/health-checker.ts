import { HealthStatus, type HealthCheckResult, combineHealthChecks } from "./health-status.js";

/**
 * A registry for health checks that can be run in parallel and combined
 * into a single health result.
 */
export class HealthChecker {
  private readonly checks = new Map<string, () => Promise<HealthCheckResult>>();

  /**
   * Register a named health check function.
   *
   * @param name  - Unique name for this check.
   * @param check - Async function that returns a {@link HealthCheckResult}.
   */
  registerCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.checks.set(name, check);
  }

  /**
   * Run all registered checks in parallel and combine the results.
   *
   * Individual check failures are caught and reported as ERROR status
   * rather than propagating exceptions.
   *
   * @returns A combined {@link HealthCheckResult} with per-check details.
   */
  async runChecks(): Promise<HealthCheckResult> {
    const entries = Array.from(this.checks.entries());

    const results = await Promise.all(
      entries.map(async ([name, check]) => {
        try {
          const result = await check();
          return [name, result] as const;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return [name, {
            status: HealthStatus.ERROR,
            message: `Check failed: ${message}`,
            timestamp: new Date(),
          }] as const;
        }
      }),
    );

    const checksRecord: Record<string, HealthCheckResult> = {};
    for (const [name, result] of results) {
      checksRecord[name] = result;
    }

    return combineHealthChecks(checksRecord);
  }
}

/**
 * Creates a health check function that verifies database connectivity
 * by executing a query function.
 *
 * @param queryFn - An async function that runs a lightweight query (e.g. `SELECT 1`).
 *                  Should throw on failure.
 * @returns A health check function suitable for {@link HealthChecker.registerCheck}.
 */
export function createDatabaseCheck(
  queryFn: () => Promise<void>,
): () => Promise<HealthCheckResult> {
  return async (): Promise<HealthCheckResult> => {
    try {
      await queryFn();
      return {
        status: HealthStatus.HEALTHY,
        message: "Database connection OK",
        timestamp: new Date(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: HealthStatus.ERROR,
        message: `Database check failed: ${message}`,
        timestamp: new Date(),
      };
    }
  };
}

/**
 * Creates a health check function that verifies an HTTP endpoint is reachable.
 *
 * @param url       - The URL to check.
 * @param timeoutMs - Request timeout in milliseconds (default: 5000).
 * @returns A health check function suitable for {@link HealthChecker.registerCheck}.
 */
export function createHttpCheck(
  url: string,
  timeoutMs: number = 5000,
): () => Promise<HealthCheckResult> {
  return async (): Promise<HealthCheckResult> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
          return {
            status: HealthStatus.HEALTHY,
            message: `HTTP ${response.status} from ${url}`,
            timestamp: new Date(),
          };
        }

        return {
          status: HealthStatus.WARNING,
          message: `HTTP ${response.status} from ${url}`,
          timestamp: new Date(),
        };
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: HealthStatus.ERROR,
        message: `HTTP check failed for ${url}: ${message}`,
        timestamp: new Date(),
      };
    }
  };
}
