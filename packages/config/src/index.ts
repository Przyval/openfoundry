export {
  type OpenFoundryConfig,
  type ServerConfig,
  type DatabaseConfig,
  type AuthConfig,
  type ServicesConfig,
  type ServiceEndpoint,
  type FeatureFlags,
  DEFAULT_CONFIG,
} from "./config-schema.js";

export { loadConfig, deepMerge, type LoadConfigOptions } from "./config-loader.js";

export { ENV_MAP, applyEnvOverrides } from "./env-mapping.js";
