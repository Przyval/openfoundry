import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// ---------------------------------------------------------------------------
// Histogram bucket boundaries (seconds) for request duration
// ---------------------------------------------------------------------------
const DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

// ---------------------------------------------------------------------------
// Metrics Collector
// ---------------------------------------------------------------------------

interface HistogramData {
  buckets: Map<number, number>; // upper-bound -> count
  sum: number;
  count: number;
}

/**
 * A lightweight Prometheus-compatible metrics collector.
 *
 * Tracks:
 * - `http_requests_total` (counter): total request count by method, route, status
 * - `http_request_duration_seconds` (histogram): request duration by method, route, status
 * - `http_errors_total` (counter): error count by method, route, status
 */
export class MetricsCollector {
  private readonly requestCounts = new Map<string, number>();
  private readonly errorCounts = new Map<string, number>();
  private readonly durations = new Map<string, HistogramData>();

  /**
   * Record a completed request.
   */
  recordRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = `method="${method}",route="${route}",status="${statusCode}"`;

    // Counter: total requests
    const reqKey = `http_requests_total{${labels}}`;
    this.requestCounts.set(reqKey, (this.requestCounts.get(reqKey) ?? 0) + 1);

    // Counter: errors (4xx/5xx)
    if (statusCode >= 400) {
      const errKey = `http_errors_total{${labels}}`;
      this.errorCounts.set(errKey, (this.errorCounts.get(errKey) ?? 0) + 1);
    }

    // Histogram: request duration
    const histKey = labels;
    let hist = this.durations.get(histKey);
    if (!hist) {
      hist = {
        buckets: new Map(DURATION_BUCKETS.map((b) => [b, 0])),
        sum: 0,
        count: 0,
      };
      this.durations.set(histKey, hist);
    }
    hist.sum += durationSeconds;
    hist.count += 1;
    for (const bound of DURATION_BUCKETS) {
      if (durationSeconds <= bound) {
        hist.buckets.set(bound, (hist.buckets.get(bound) ?? 0) + 1);
      }
    }
  }

  /**
   * Serialize all metrics in Prometheus text exposition format.
   */
  serialize(): string {
    const lines: string[] = [];

    // -- http_requests_total --
    lines.push("# HELP http_requests_total Total number of HTTP requests.");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, value] of this.requestCounts) {
      lines.push(`${key} ${value}`);
    }

    // -- http_errors_total --
    lines.push("# HELP http_errors_total Total number of HTTP errors (4xx/5xx).");
    lines.push("# TYPE http_errors_total counter");
    for (const [key, value] of this.errorCounts) {
      lines.push(`${key} ${value}`);
    }

    // -- http_request_duration_seconds --
    lines.push(
      "# HELP http_request_duration_seconds HTTP request duration in seconds.",
    );
    lines.push("# TYPE http_request_duration_seconds histogram");
    for (const [labels, hist] of this.durations) {
      for (const [bound, count] of hist.buckets) {
        lines.push(
          `http_request_duration_seconds_bucket{${labels},le="${bound}"} ${count}`,
        );
      }
      lines.push(
        `http_request_duration_seconds_bucket{${labels},le="+Inf"} ${hist.count}`,
      );
      lines.push(
        `http_request_duration_seconds_sum{${labels}} ${hist.sum}`,
      );
      lines.push(
        `http_request_duration_seconds_count{${labels}} ${hist.count}`,
      );
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Reset all metrics. Primarily useful for testing.
   */
  reset(): void {
    this.requestCounts.clear();
    this.errorCounts.clear();
    this.durations.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton collector
// ---------------------------------------------------------------------------

/** Shared metrics collector instance. */
export const metrics = new MetricsCollector();

// ---------------------------------------------------------------------------
// Fastify Plugin
// ---------------------------------------------------------------------------

/**
 * Fastify plugin that:
 * 1. Hooks into every request to record metrics (duration, status, etc.).
 * 2. Exposes a GET /metrics endpoint returning Prometheus text format.
 *
 * Usage:
 * ```ts
 * import { metricsPlugin } from "@openfoundry/health/metrics";
 * await app.register(metricsPlugin);
 * ```
 */
export async function metricsPlugin(app: FastifyInstance): Promise<void> {
  // Attach start time to each request
  app.addHook("onRequest", async (request: FastifyRequest) => {
    (request as unknown as Record<string, number>).__metricsStart =
      performance.now();
  });

  // Record metrics after response is sent
  app.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const startMs = (request as unknown as Record<string, number>)
        .__metricsStart;
      if (startMs === undefined) return;

      const durationSeconds = (performance.now() - startMs) / 1000;

      // Use the matched route pattern (e.g. "/api/v2/objects/:objectType")
      // rather than the raw URL to keep cardinality manageable.
      const route =
        (request.routeOptions?.url as string | undefined) ??
        request.url;
      const method = request.method;
      const statusCode = reply.statusCode;

      metrics.recordRequest(method, route, statusCode, durationSeconds);
    },
  );

  // Expose /metrics endpoint
  app.get("/metrics", async (_request: FastifyRequest, reply: FastifyReply) => {
    reply
      .type("text/plain; version=0.0.4; charset=utf-8")
      .send(metrics.serialize());
  });
}
