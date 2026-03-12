/**
 * Health status values matching Palantir's 7 health states.
 *
 * Ordered from healthiest to most severe so that numeric comparison
 * can be used to determine the "worst" status in a set.
 */
export enum HealthStatus {
  HEALTHY = "HEALTHY",
  REPAIRING = "REPAIRING",
  WARNING = "WARNING",
  ERROR = "ERROR",
  TERMINAL = "TERMINAL",
  UNKNOWN = "UNKNOWN",
  SUSPENDED = "SUSPENDED",
}

/**
 * The result of running a single health check or a combined set of checks.
 */
export interface HealthCheckResult {
  /** The overall status of this check. */
  readonly status: HealthStatus;

  /** Optional human-readable message describing the health state. */
  readonly message?: string;

  /** Timestamp of when the check was performed. */
  readonly timestamp: Date;

  /** Sub-check results, keyed by check name. Present on combined results. */
  readonly details?: Record<string, HealthCheckResult>;
}

/**
 * Severity ordering for health statuses, from least severe (0) to most
 * severe. Used by {@link combineHealthChecks} to determine the worst status.
 */
const SEVERITY: Record<HealthStatus, number> = {
  [HealthStatus.HEALTHY]: 0,
  [HealthStatus.REPAIRING]: 1,
  [HealthStatus.WARNING]: 2,
  [HealthStatus.ERROR]: 3,
  [HealthStatus.TERMINAL]: 4,
  [HealthStatus.UNKNOWN]: 5,
  [HealthStatus.SUSPENDED]: 6,
};

/**
 * Combines multiple health check results into a single result.
 *
 * The combined status is the worst (most severe) status among all checks.
 * All individual results are preserved in the `details` field.
 *
 * @param checks - A record of named health check results.
 * @returns A combined {@link HealthCheckResult} with the worst status.
 */
export function combineHealthChecks(
  checks: Record<string, HealthCheckResult>,
): HealthCheckResult {
  const entries = Object.entries(checks);

  if (entries.length === 0) {
    return {
      status: HealthStatus.HEALTHY,
      message: "No checks registered",
      timestamp: new Date(),
      details: {},
    };
  }

  let worstStatus = HealthStatus.HEALTHY;
  for (const [, result] of entries) {
    if (SEVERITY[result.status] > SEVERITY[worstStatus]) {
      worstStatus = result.status;
    }
  }

  return {
    status: worstStatus,
    message: worstStatus === HealthStatus.HEALTHY
      ? "All checks passed"
      : `Degraded: worst status is ${worstStatus}`,
    timestamp: new Date(),
    details: checks,
  };
}
