import { describe, it, expect } from "vitest";
import { safeArg, unsafeArg } from "@openfoundry/errors";
import { Logger } from "../src/logger.js";
import { LogLevel, parseLogLevel } from "../src/log-level.js";
import { createRequestLogger, logRequest } from "../src/request-logger.js";

function createTestLogger(
  overrides: {
    level?: LogLevel;
    redactUnsafe?: boolean;
  } = {},
): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger = new Logger({
    service: "test-service",
    level: overrides.level ?? LogLevel.DEBUG,
    redactUnsafe: overrides.redactUnsafe ?? false,
    output: (line: string) => lines.push(line),
  });
  return { logger, lines };
}

function parseLine(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

describe("Logger", () => {
  it("outputs valid JSON", () => {
    const { logger, lines } = createTestLogger();
    logger.info("hello world");
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0]!)).not.toThrow();
  });

  it("includes timestamp, level, message, and service in output", () => {
    const { logger, lines } = createTestLogger();
    logger.info("test message");
    const entry = parseLine(lines[0]!);
    expect(entry["timestamp"]).toBeDefined();
    expect(entry["level"]).toBe("INFO");
    expect(entry["message"]).toBe("test message");
    expect(entry["service"]).toBe("test-service");
  });

  it("places SafeArg values in the safe field", () => {
    const { logger, lines } = createTestLogger();
    logger.info("lookup", safeArg("objectType", "Employee"));
    const entry = parseLine(lines[0]!);
    const safe = entry["safe"] as Record<string, unknown>;
    expect(safe["objectType"]).toBe("Employee");
  });

  it("places UnsafeArg values in the unsafe field when redactUnsafe is false", () => {
    const { logger, lines } = createTestLogger({ redactUnsafe: false });
    logger.info("user action", unsafeArg("email", "alice@example.com"));
    const entry = parseLine(lines[0]!);
    const unsafe = entry["unsafe"] as Record<string, unknown>;
    expect(unsafe["email"]).toBe("alice@example.com");
  });

  it("redacts UnsafeArg values when redactUnsafe is true", () => {
    const { logger, lines } = createTestLogger({ redactUnsafe: true });
    logger.info("user action", unsafeArg("email", "alice@example.com"));
    const entry = parseLine(lines[0]!);
    const unsafe = entry["unsafe"] as Record<string, unknown>;
    expect(unsafe["email"]).toBe("[REDACTED]");
  });

  it("filters messages below the configured log level", () => {
    const { logger, lines } = createTestLogger({ level: LogLevel.WARN });
    logger.debug("should not appear");
    logger.info("should not appear either");
    logger.warn("should appear");
    expect(lines).toHaveLength(1);
    expect(parseLine(lines[0]!)["level"]).toBe("WARN");
  });

  it("logs all levels at or above the configured level", () => {
    const { logger, lines } = createTestLogger({ level: LogLevel.WARN });
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");
    expect(lines).toHaveLength(3);
  });
});

describe("child logger", () => {
  it("inherits parent bindings in every log line", () => {
    const { logger, lines } = createTestLogger();
    const child = logger.child({
      traceId: safeArg("traceId", "abc-123"),
    });
    child.info("first");
    child.info("second");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const entry = parseLine(line);
      const safe = entry["safe"] as Record<string, unknown>;
      expect(safe["traceId"]).toBe("abc-123");
    }
  });

  it("merges child args with parent bindings", () => {
    const { logger, lines } = createTestLogger();
    const child = logger.child({
      traceId: safeArg("traceId", "abc-123"),
    });
    child.info("event", safeArg("action", "click"));
    const entry = parseLine(lines[0]!);
    const safe = entry["safe"] as Record<string, unknown>;
    expect(safe["traceId"]).toBe("abc-123");
    expect(safe["action"]).toBe("click");
  });

  it("inherits unsafe bindings and respects redactUnsafe", () => {
    const lines: string[] = [];
    const logger = new Logger({
      service: "test",
      level: LogLevel.DEBUG,
      redactUnsafe: true,
      output: (line) => lines.push(line),
    });
    const child = logger.child({
      userId: unsafeArg("userId", "user-42"),
    });
    child.info("action");
    const entry = parseLine(lines[0]!);
    const unsafe = entry["unsafe"] as Record<string, unknown>;
    expect(unsafe["userId"]).toBe("[REDACTED]");
  });
});

describe("parseLogLevel", () => {
  it("parses valid log level strings", () => {
    expect(parseLogLevel("debug")).toBe(LogLevel.DEBUG);
    expect(parseLogLevel("info")).toBe(LogLevel.INFO);
    expect(parseLogLevel("warn")).toBe(LogLevel.WARN);
    expect(parseLogLevel("error")).toBe(LogLevel.ERROR);
    expect(parseLogLevel("fatal")).toBe(LogLevel.FATAL);
  });

  it("is case-insensitive", () => {
    expect(parseLogLevel("DEBUG")).toBe(LogLevel.DEBUG);
    expect(parseLogLevel("Info")).toBe(LogLevel.INFO);
  });

  it("throws on invalid log level", () => {
    expect(() => parseLogLevel("verbose")).toThrow(/Invalid log level/);
  });
});

describe("request logger", () => {
  it("createRequestLogger adds requestId binding", () => {
    const { logger, lines } = createTestLogger();
    const reqLogger = createRequestLogger(logger, "req-001");
    reqLogger.info("handling");
    const entry = parseLine(lines[0]!);
    const safe = entry["safe"] as Record<string, unknown>;
    expect(safe["requestId"]).toBe("req-001");
  });

  it("logRequest logs method, url, statusCode, and durationMs", () => {
    const { logger, lines } = createTestLogger();
    logRequest(logger, "GET", "/api/objects", 200, 42);
    const entry = parseLine(lines[0]!);
    expect(entry["message"]).toBe("HTTP request completed");
    const safe = entry["safe"] as Record<string, unknown>;
    expect(safe["method"]).toBe("GET");
    expect(safe["url"]).toBe("/api/objects");
    expect(safe["statusCode"]).toBe(200);
    expect(safe["durationMs"]).toBe(42);
  });
});
