import { describe, it, expect } from "vitest";
import { Tracer, Span, generateTraceId, generateSpanId } from "../src/index.js";

describe("tracing", () => {
  // --- Span lifecycle ---

  it("should create a span with correct operationName and startTime", () => {
    const tracer = new Tracer("test-service");
    const span = tracer.startSpan("my-operation");
    expect(span.operationName).toBe("my-operation");
    expect(span.startTime).toBeLessThanOrEqual(Date.now());
    expect(span.status).toBe("OK");
    expect(span.endTime).toBeUndefined();
  });

  it("should set endTime when span.finish() is called", () => {
    const tracer = new Tracer("test-service");
    const span = tracer.startSpan("op");
    expect(span.endTime).toBeUndefined();
    span.finish();
    expect(span.endTime).toBeGreaterThanOrEqual(span.startTime);
  });

  it("should generate unique traceId and spanId for each span", () => {
    const tracer = new Tracer("svc");
    const s1 = tracer.startSpan("a");
    const s2 = tracer.startSpan("b");
    expect(s1.traceId).not.toBe(s2.traceId);
    expect(s1.spanId).not.toBe(s2.spanId);
  });

  // --- Tags and Logs ---

  it("should set and retrieve tags on a span", () => {
    const tracer = new Tracer("svc");
    const span = tracer.startSpan("op");
    span.setTag("http.method", "GET");
    span.setTag("http.status", "200");
    expect(span.tags.get("http.method")).toBe("GET");
    expect(span.tags.get("http.status")).toBe("200");
  });

  it("should append timestamped log entries", () => {
    const tracer = new Tracer("svc");
    const span = tracer.startSpan("op");
    span.log("starting work");
    span.log("work complete");
    expect(span.logs).toHaveLength(2);
    expect(span.logs[0].message).toBe("starting work");
    expect(span.logs[1].message).toBe("work complete");
    expect(span.logs[0].timestamp).toBeLessThanOrEqual(span.logs[1].timestamp);
  });

  // --- Error handling ---

  it("should set status to ERROR and log message on setError", () => {
    const tracer = new Tracer("svc");
    const span = tracer.startSpan("op");
    span.setError(new Error("something broke"));
    expect(span.status).toBe("ERROR");
    expect(span.logs).toHaveLength(1);
    expect(span.logs[0].message).toBe("something broke");
  });

  // --- Parent-child spans ---

  it("should create child span inheriting parent traceId", () => {
    const tracer = new Tracer("svc");
    const parent = tracer.startSpan("parent-op");
    const child = tracer.startSpan("child-op", { parent });
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(child.spanId).not.toBe(parent.spanId);
  });

  // --- B3 header injection ---

  it("should inject B3 headers from a span", () => {
    const tracer = new Tracer("svc");
    const span = tracer.startSpan("op");
    const headers = tracer.inject(span);
    expect(headers["X-B3-TraceId"]).toBe(span.traceId);
    expect(headers["X-B3-SpanId"]).toBe(span.spanId);
    expect(headers["X-B3-Sampled"]).toBe("1");
  });

  it("should include ParentSpanId header when span has a parent", () => {
    const tracer = new Tracer("svc");
    const parent = tracer.startSpan("parent");
    const child = tracer.startSpan("child", { parent });
    const headers = tracer.inject(child);
    expect(headers["X-B3-ParentSpanId"]).toBe(parent.spanId);
  });

  // --- B3 header extraction ---

  it("should extract SpanContext from B3 headers", () => {
    const tracer = new Tracer("svc");
    const ctx = tracer.extract({
      "X-B3-TraceId": "abcd1234abcd1234abcd1234abcd1234",
      "X-B3-SpanId": "abcd1234abcd1234",
      "X-B3-ParentSpanId": "1111222233334444",
      "X-B3-Sampled": "1",
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.traceId).toBe("abcd1234abcd1234abcd1234abcd1234");
    expect(ctx!.spanId).toBe("abcd1234abcd1234");
    expect(ctx!.parentSpanId).toBe("1111222233334444");
    expect(ctx!.sampled).toBe(true);
  });

  it("should return null when required B3 headers are missing", () => {
    const tracer = new Tracer("svc");
    expect(tracer.extract({})).toBeNull();
    expect(tracer.extract({ "X-B3-TraceId": "abc" })).toBeNull();
    expect(tracer.extract({ "X-B3-SpanId": "abc" })).toBeNull();
  });

  it("should treat X-B3-Sampled '0' as not sampled", () => {
    const tracer = new Tracer("svc");
    const ctx = tracer.extract({
      "X-B3-TraceId": "abcd1234abcd1234abcd1234abcd1234",
      "X-B3-SpanId": "abcd1234abcd1234",
      "X-B3-Sampled": "0",
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.sampled).toBe(false);
  });

  // --- ID generation ---

  it("should generate IDs with correct lengths", () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    expect(traceId).toHaveLength(32);
    expect(spanId).toHaveLength(16);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });
});
