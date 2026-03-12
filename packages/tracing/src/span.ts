export type SpanStatus = "OK" | "ERROR";

export interface SpanLogEntry {
  timestamp: number;
  message: string;
}

/**
 * Represents a single unit of work in a distributed trace.
 */
export class Span {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly parentSpanId?: string;
  public readonly operationName: string;
  public readonly startTime: number;
  public endTime?: number;
  public status: SpanStatus = "OK";
  public readonly tags: Map<string, string> = new Map();
  public readonly logs: SpanLogEntry[] = [];

  constructor(options: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    operationName: string;
  }) {
    this.traceId = options.traceId;
    this.spanId = options.spanId;
    this.parentSpanId = options.parentSpanId;
    this.operationName = options.operationName;
    this.startTime = Date.now();
  }

  /**
   * Mark the span as finished by setting the end time.
   */
  finish(): void {
    this.endTime = Date.now();
  }

  /**
   * Set a key-value tag on this span.
   */
  setTag(key: string, value: string): void {
    this.tags.set(key, value);
  }

  /**
   * Append a timestamped log entry.
   */
  log(message: string): void {
    this.logs.push({ timestamp: Date.now(), message });
  }

  /**
   * Mark the span as errored and log the error message.
   */
  setError(error: Error): void {
    this.status = "ERROR";
    this.log(error.message);
  }
}
