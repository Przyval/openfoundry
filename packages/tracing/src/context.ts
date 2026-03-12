/**
 * Span context for propagation across service boundaries.
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

/**
 * Generate a 32-character hex trace ID.
 */
export function generateTraceId(): string {
  return randomHex(32);
}

/**
 * Generate a 16-character hex span ID.
 */
export function generateSpanId(): string {
  return randomHex(16);
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
