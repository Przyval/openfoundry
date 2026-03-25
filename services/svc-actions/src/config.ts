/**
 * Server configuration, resolved from environment variables with sensible defaults.
 */
export interface ActionsConfig {
  /** Port the HTTP server binds to. */
  readonly port: number;

  /** Host address to bind (0.0.0.0 for all interfaces). */
  readonly host: string;

  /** Log level: "fatal" | "error" | "warn" | "info" | "debug" | "trace". */
  readonly logLevel: string;

  /** Node environment. */
  readonly nodeEnv: string;

  /** PostgreSQL connection string.  When set, the PG store is used instead of in-memory. */
  readonly databaseUrl?: string;

  /** Base URL of the Objects service (svc-objects) for action handlers to call. */
  readonly objectsServiceUrl: string;
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer, got: "${raw}"`);
  }
  return parsed;
}

export function loadConfig(): ActionsConfig {
  return {
    port: envInt("PORT", 8083),
    host: env("HOST", "0.0.0.0"),
    logLevel: env("LOG_LEVEL", "info"),
    nodeEnv: env("NODE_ENV", "development"),
    databaseUrl: process.env.DATABASE_URL || undefined,
    objectsServiceUrl: env("OBJECTS_SERVICE_URL", "http://localhost:8082"),
  };
}
