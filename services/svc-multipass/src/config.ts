/**
 * Server configuration, resolved from environment variables with sensible defaults.
 *
 * All configuration is read once at startup. Changing values requires a restart.
 */
export interface MultipassConfig {
  /** Port the HTTP server binds to. */
  readonly port: number;

  /** Host address to bind (0.0.0.0 for all interfaces). */
  readonly host: string;

  /** Database connection URL. */
  readonly databaseUrl: string;

  /** PEM-encoded ES256 private key for signing JWTs. */
  readonly jwtPrivateKey: string;

  /** PEM-encoded ES256 public key for verifying JWTs. */
  readonly jwtPublicKey: string;

  /** Access token lifetime in seconds. */
  readonly tokenExpirySeconds: number;

  /** Refresh token lifetime in seconds. */
  readonly refreshTokenExpirySeconds: number;

  /** Log level: "fatal" | "error" | "warn" | "info" | "debug" | "trace". */
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
    throw new Error(`Environment variable ${key} must be a valid integer, got: "${raw}"`);
  }
  return parsed;
}

export function loadConfig(): MultipassConfig {
  return {
    port: envInt("PORT", 8084),
    host: env("HOST", "0.0.0.0"),
    databaseUrl: env("DATABASE_URL", ""),
    jwtPrivateKey: env("JWT_PRIVATE_KEY", ""),
    jwtPublicKey: env("JWT_PUBLIC_KEY", ""),
    tokenExpirySeconds: envInt("TOKEN_EXPIRY_SECONDS", 3600),
    refreshTokenExpirySeconds: envInt("REFRESH_TOKEN_EXPIRY_SECONDS", 86400 * 30),
    logLevel: env("LOG_LEVEL", "info"),
    nodeEnv: env("NODE_ENV", "development"),
  };
}
