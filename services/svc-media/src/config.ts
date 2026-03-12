/**
 * Service configuration resolved from environment variables.
 */
export interface MediaServiceConfig {
  /** Port the HTTP server binds to. */
  readonly port: number;

  /** Host address to bind (0.0.0.0 for all interfaces). */
  readonly host: string;

  /** Log level. */
  readonly logLevel: string;

  /** Node environment. */
  readonly nodeEnv: string;
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Environment variable ${key} must be a valid integer, got: "${raw}"`,
    );
  }
  return parsed;
}

export function loadConfig(): MediaServiceConfig {
  return {
    port: envInt("PORT", 8090),
    host: env("HOST", "0.0.0.0"),
    logLevel: env("LOG_LEVEL", "info"),
    nodeEnv: env("NODE_ENV", "development"),
  };
}
