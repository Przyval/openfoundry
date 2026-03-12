/**
 * Server configuration for the Object Storage & Query service.
 */
export interface ObjectsConfig {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;

  /** PostgreSQL connection string.  When set, the PG store is used instead of in-memory. */
  readonly databaseUrl?: string;
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

export function loadConfig(): ObjectsConfig {
  return {
    port: envInt("PORT", 8082),
    host: env("HOST", "0.0.0.0"),
    logLevel: env("LOG_LEVEL", "info"),
    databaseUrl: process.env.DATABASE_URL || undefined,
  };
}
