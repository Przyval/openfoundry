/**
 * Log levels for the OpenFoundry logging system.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

const LOG_LEVEL_NAMES: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  fatal: LogLevel.FATAL,
};

const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.FATAL]: "FATAL",
};

/**
 * Parses a string log level name into a LogLevel enum value.
 * Matching is case-insensitive.
 *
 * @throws Error if the string is not a valid log level
 */
export function parseLogLevel(str: string): LogLevel {
  const level = LOG_LEVEL_NAMES[str.toLowerCase()];
  if (level === undefined) {
    throw new Error(
      `Invalid log level: "${str}". Valid levels: ${Object.keys(LOG_LEVEL_NAMES).join(", ")}`,
    );
  }
  return level;
}

/**
 * Returns the string label for a LogLevel.
 */
export function logLevelLabel(level: LogLevel): string {
  return LOG_LEVEL_LABELS[level];
}
