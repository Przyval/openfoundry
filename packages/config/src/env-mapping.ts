/**
 * Environment variable mapping for OpenFoundry configuration.
 *
 * Maps environment variable names to configuration paths and handles
 * type coercion from string env values to the correct config types.
 */

import type { OpenFoundryConfig } from "./config-schema.js";

interface EnvMappingEntry {
  readonly path: string;
  readonly coerce: (value: string) => unknown;
}

function identity(value: string): string {
  return value;
}

function toNumber(value: string): number {
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new Error(`Cannot coerce "${value}" to number`);
  }
  return n;
}

function toBoolean(value: string): boolean {
  return value === "true" || value === "1";
}

function toStringArray(value: string): readonly string[] {
  return value.split(",").map((s) => s.trim());
}

/**
 * Maps environment variable names to their configuration paths
 * and appropriate type coercion functions.
 */
export const ENV_MAP: Record<string, EnvMappingEntry> = {
  OPENFOUNDRY_PORT: { path: "server.port", coerce: toNumber },
  OPENFOUNDRY_HOST: { path: "server.host", coerce: identity },
  OPENFOUNDRY_LOG_LEVEL: { path: "server.logLevel", coerce: identity },
  OPENFOUNDRY_CORS_ORIGINS: { path: "server.corsOrigins", coerce: toStringArray },

  OPENFOUNDRY_DATABASE_URL: { path: "database.url", coerce: identity },
  OPENFOUNDRY_DATABASE_POOL_SIZE: { path: "database.poolSize", coerce: toNumber },
  OPENFOUNDRY_DATABASE_SSL: { path: "database.ssl", coerce: toBoolean },
  OPENFOUNDRY_DATABASE_MIGRATION_PATH: { path: "database.migrationPath", coerce: identity },

  OPENFOUNDRY_JWT_PUBLIC_KEY: { path: "auth.jwtPublicKey", coerce: identity },
  OPENFOUNDRY_JWT_PRIVATE_KEY: { path: "auth.jwtPrivateKey", coerce: identity },
  OPENFOUNDRY_TOKEN_EXPIRY_SECONDS: { path: "auth.tokenExpirySeconds", coerce: toNumber },
  OPENFOUNDRY_REFRESH_TOKEN_EXPIRY_SECONDS: { path: "auth.refreshTokenExpirySeconds", coerce: toNumber },
  OPENFOUNDRY_AUTH_ISSUER: { path: "auth.issuer", coerce: identity },

  OPENFOUNDRY_GATEWAY_URL: { path: "services.gateway.url", coerce: identity },
  OPENFOUNDRY_GATEWAY_TIMEOUT: { path: "services.gateway.timeout", coerce: toNumber },
  OPENFOUNDRY_MULTIPASS_URL: { path: "services.multipass.url", coerce: identity },
  OPENFOUNDRY_MULTIPASS_TIMEOUT: { path: "services.multipass.timeout", coerce: toNumber },
  OPENFOUNDRY_ONTOLOGY_URL: { path: "services.ontology.url", coerce: identity },
  OPENFOUNDRY_ONTOLOGY_TIMEOUT: { path: "services.ontology.timeout", coerce: toNumber },
  OPENFOUNDRY_OBJECTS_URL: { path: "services.objects.url", coerce: identity },
  OPENFOUNDRY_OBJECTS_TIMEOUT: { path: "services.objects.timeout", coerce: toNumber },
  OPENFOUNDRY_ACTIONS_URL: { path: "services.actions.url", coerce: identity },
  OPENFOUNDRY_ACTIONS_TIMEOUT: { path: "services.actions.timeout", coerce: toNumber },
};

/**
 * Sets a deeply nested property on an object using a dot-separated path.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current[part] === undefined || typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
}

/**
 * Applies environment variable overrides to a configuration object.
 * Environment variables are looked up in ENV_MAP and their values are
 * coerced to the appropriate type before being set.
 */
export function applyEnvOverrides(
  config: OpenFoundryConfig,
  env: Record<string, string | undefined>,
): OpenFoundryConfig {
  // Create a mutable deep copy
  const result = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

  for (const [envVar, mapping] of Object.entries(ENV_MAP)) {
    const value = env[envVar];
    if (value !== undefined) {
      setNestedValue(result, mapping.path, mapping.coerce(value));
    }
  }

  return result as unknown as OpenFoundryConfig;
}
