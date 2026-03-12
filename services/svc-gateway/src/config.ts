// ---------------------------------------------------------------------------
// Augment Fastify so `app.config` is typed
// ---------------------------------------------------------------------------

declare module "fastify" {
  interface FastifyInstance {
    config: GatewayConfig;
  }
}

/**
 * Server configuration, resolved from environment variables with sensible defaults.
 *
 * All configuration is read once at startup. Changing values requires a restart.
 */
export interface GatewayConfig {
  /** Port the HTTP server binds to. */
  readonly port: number;

  /** Host address to bind (0.0.0.0 for all interfaces). */
  readonly host: string;

  /**
   * PEM-encoded public key (or JWKS URL) used to verify incoming JWTs.
   * In production this should be set via AUTH_PUBLIC_KEY or AUTH_JWKS_URL.
   */
  readonly authPublicKey: string;

  /** Expected JWT issuer claim. */
  readonly authIssuer: string;

  /** Expected JWT audience claim. */
  readonly authAudience: string;

  /** Base URLs for downstream services. */
  readonly services: {
    readonly multipass: string;
    readonly ontology: string;
    readonly objects: string;
    readonly actions: string;
    readonly datasets: string;
    readonly compass: string;
    readonly admin: string;
    readonly functions: string;
    readonly webhooks: string;
    readonly media: string;
    readonly sentinel: string;
    readonly aip: string;
  };

  /** Rate limiting configuration. */
  readonly rateLimit: {
    /** Whether rate limiting is enabled. */
    readonly enabled: boolean;
    /** Maximum number of requests per window. */
    readonly maxRequests: number;
    /** Window duration in milliseconds. */
    readonly windowMs: number;
  };

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

export function loadConfig(): GatewayConfig {
  return {
    port: envInt("PORT", 8080),
    host: env("HOST", "0.0.0.0"),
    authPublicKey: env("AUTH_PUBLIC_KEY", ""),
    authIssuer: env("AUTH_ISSUER", "openfoundry"),
    authAudience: env("AUTH_AUDIENCE", "openfoundry-api"),
    services: {
      multipass: env("MULTIPASS_SERVICE_URL", "http://localhost:8084"),
      ontology: env("ONTOLOGY_SERVICE_URL", "http://localhost:8081"),
      objects: env("OBJECTS_SERVICE_URL", "http://localhost:8082"),
      actions: env("ACTIONS_SERVICE_URL", "http://localhost:8083"),
      datasets: env("DATASETS_SERVICE_URL", "http://localhost:8085"),
      compass: env("COMPASS_SERVICE_URL", "http://localhost:8086"),
      admin: env("ADMIN_SERVICE_URL", "http://localhost:8087"),
      functions: env("FUNCTIONS_SERVICE_URL", "http://localhost:8088"),
      webhooks: env("WEBHOOKS_SERVICE_URL", "http://localhost:8089"),
      media: env("MEDIA_SERVICE_URL", "http://localhost:8090"),
      sentinel: env("SENTINEL_SERVICE_URL", "http://localhost:8091"),
      aip: env("AIP_SERVICE_URL", "http://localhost:8092"),
    },
    rateLimit: {
      enabled: env("RATE_LIMIT_ENABLED", "true") === "true",
      maxRequests: envInt("RATE_LIMIT_MAX_REQUESTS", 100),
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
    },
    logLevel: env("LOG_LEVEL", "info"),
    nodeEnv: env("NODE_ENV", "development"),
  };
}
