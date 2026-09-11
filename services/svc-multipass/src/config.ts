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

/**
 * An environment variable that is set but empty is treated as absent, so it
 * falls back to the value below rather than through it. An exported empty
 * string is what a blanked line in a `.env` file produces, and for a variable
 * like JWT_PRIVATE_KEY empty already has its own meaning - generate an
 * ephemeral pair - so it must never be mistaken for a configured value.
 */
function env(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw === undefined || raw === "" ? fallback : raw;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
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

/**
 * JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are one pair. With only one of them set
 * the service falls back to an ephemeral pair, and every token it then mints
 * is rejected by whatever verifies with the key that *was* configured - a 401
 * on every request, from a deployment that looks configured.
 */
export function warnIfHalfConfigured(
  app: { log: { warn: (msg: string) => void } },
  config: Pick<MultipassConfig, "jwtPrivateKey" | "jwtPublicKey">,
): void {
  if (!!config.jwtPrivateKey === !!config.jwtPublicKey) return;
  const missing = config.jwtPrivateKey ? "JWT_PUBLIC_KEY" : "JWT_PRIVATE_KEY";
  app.log.warn(
    `Only one half of the JWT key pair is configured (${missing} is empty), ` +
      "so an ephemeral pair is being generated instead. Nothing else can " +
      "verify tokens signed with it.",
  );
}
