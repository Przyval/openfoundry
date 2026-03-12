import { Span } from "./span.js";
import { SpanContext, generateTraceId, generateSpanId } from "./context.js";

export interface StartSpanOptions {
  parent?: Span;
}

/**
 * Creates and manages spans for a named service.
 */
export class Tracer {
  public readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Start a new span. If a parent span is provided, the child inherits
   * the parent's traceId and records the parent's spanId as parentSpanId.
   */
  startSpan(operationName: string, options?: StartSpanOptions): Span {
    const parent = options?.parent;
    return new Span({
      traceId: parent ? parent.traceId : generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId: parent?.spanId,
      operationName,
    });
  }

  /**
   * Extract a SpanContext from incoming B3 propagation headers.
   * Returns null if the required headers are missing.
   */
  extract(headers: Record<string, string | undefined>): SpanContext | null {
    const traceId = headers["X-B3-TraceId"] ?? headers["x-b3-traceid"];
    const spanId = headers["X-B3-SpanId"] ?? headers["x-b3-spanid"];

    if (!traceId || !spanId) {
      return null;
    }

    const parentSpanId =
      headers["X-B3-ParentSpanId"] ?? headers["x-b3-parentspanid"];
    const sampledRaw =
      headers["X-B3-Sampled"] ?? headers["x-b3-sampled"];

    return {
      traceId,
      spanId,
      parentSpanId: parentSpanId ?? undefined,
      sampled: sampledRaw !== "0",
    };
  }

  /**
   * Inject a span's context into B3 propagation headers.
   */
  inject(span: Span): Record<string, string> {
    const headers: Record<string, string> = {
      "X-B3-TraceId": span.traceId,
      "X-B3-SpanId": span.spanId,
      "X-B3-Sampled": "1",
    };

    if (span.parentSpanId) {
      headers["X-B3-ParentSpanId"] = span.parentSpanId;
    }

    return headers;
  }
}
