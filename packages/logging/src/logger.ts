/**
 * Structured JSON logger with SafeArg/UnsafeArg classification.
 *
 * SafeArgs appear in the `safe` field of log output.
 * UnsafeArgs appear in the `unsafe` field, or are redacted when
 * the `redactUnsafe` option is enabled.
 */

import type { SafeArg, UnsafeArg } from "@openfoundry/errors";
import { LogLevel, logLevelLabel } from "./log-level.js";

type LogArg = SafeArg<unknown> | UnsafeArg<unknown>;

export interface LoggerOptions {
  /** Service name included in every log line */
  readonly service: string;
  /** Minimum log level. Defaults to INFO */
  readonly level?: LogLevel;
  /** When true, unsafe arg values are replaced with "[REDACTED]" */
  readonly redactUnsafe?: boolean;
  /** Custom output function. Defaults to console.log */
  readonly output?: (line: string) => void;
}

interface LogEntry {
  readonly timestamp: string;
  readonly level: string;
  readonly message: string;
  readonly service: string;
  readonly safe: Record<string, unknown>;
  readonly unsafe: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * Structured JSON logger that classifies arguments as safe or unsafe.
 */
export class Logger {
  private readonly service: string;
  private readonly level: LogLevel;
  private readonly redactUnsafe: boolean;
  private readonly output: (line: string) => void;
  private readonly bindings: Record<string, unknown>;
  private readonly unsafeBindings: Record<string, unknown>;

  constructor(options: LoggerOptions);
  constructor(
    options: LoggerOptions,
    bindings: Record<string, unknown>,
    unsafeBindings: Record<string, unknown>,
  );
  constructor(
    options: LoggerOptions,
    bindings?: Record<string, unknown>,
    unsafeBindings?: Record<string, unknown>,
  ) {
    this.service = options.service;
    this.level = options.level ?? LogLevel.INFO;
    this.redactUnsafe = options.redactUnsafe ?? false;
    this.output = options.output ?? ((line: string) => console.log(line));
    this.bindings = bindings ?? {};
    this.unsafeBindings = unsafeBindings ?? {};
  }

  debug(message: string, ...args: LogArg[]): void {
    this.log(LogLevel.DEBUG, message, args);
  }

  info(message: string, ...args: LogArg[]): void {
    this.log(LogLevel.INFO, message, args);
  }

  warn(message: string, ...args: LogArg[]): void {
    this.log(LogLevel.WARN, message, args);
  }

  error(message: string, ...args: LogArg[]): void {
    this.log(LogLevel.ERROR, message, args);
  }

  fatal(message: string, ...args: LogArg[]): void {
    this.log(LogLevel.FATAL, message, args);
  }

  /**
   * Creates a child logger that inherits the parent's configuration
   * and adds the given bindings to every log line.
   */
  child(childBindings: Record<string, LogArg>): Logger {
    const safeBindings: Record<string, unknown> = { ...this.bindings };
    const unsafeBindings: Record<string, unknown> = { ...this.unsafeBindings };

    for (const [key, arg] of Object.entries(childBindings)) {
      if (arg.safe) {
        safeBindings[key] = arg.value;
      } else {
        unsafeBindings[key] = arg.value;
      }
    }

    return new Logger(
      {
        service: this.service,
        level: this.level,
        redactUnsafe: this.redactUnsafe,
        output: this.output,
      },
      safeBindings,
      unsafeBindings,
    );
  }

  private log(level: LogLevel, message: string, args: LogArg[]): void {
    if (level < this.level) {
      return;
    }

    const safeArgs: Record<string, unknown> = { ...this.bindings };
    const unsafeArgs: Record<string, unknown> = { ...this.unsafeBindings };

    for (const arg of args) {
      if (arg.safe) {
        safeArgs[arg.key] = arg.value;
      } else {
        unsafeArgs[arg.key] = arg.value;
      }
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: logLevelLabel(level),
      message,
      service: this.service,
      safe: safeArgs,
      unsafe: this.redactUnsafe ? redactValues(unsafeArgs) : unsafeArgs,
    };

    this.output(JSON.stringify(entry));
  }
}

function redactValues(record: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    redacted[key] = "[REDACTED]";
  }
  return redacted;
}
