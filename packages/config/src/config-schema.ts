/**
 * Configuration schema for the OpenFoundry platform.
 */

export interface ServiceEndpoint {
  readonly url: string;
  readonly timeout: number;
}

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly corsOrigins: readonly string[];
}

export interface DatabaseConfig {
  readonly url: string;
  readonly poolSize: number;
  readonly ssl: boolean;
  readonly migrationPath: string;
}

export interface AuthConfig {
  readonly jwtPublicKey: string;
  readonly jwtPrivateKey: string;
  readonly tokenExpirySeconds: number;
  readonly refreshTokenExpirySeconds: number;
  readonly issuer: string;
}

export interface ServicesConfig {
  readonly gateway: ServiceEndpoint;
  readonly multipass: ServiceEndpoint;
  readonly ontology: ServiceEndpoint;
  readonly objects: ServiceEndpoint;
  readonly actions: ServiceEndpoint;
}

export type FeatureFlags = Record<string, boolean>;

export interface OpenFoundryConfig {
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly auth: AuthConfig;
  readonly services: ServicesConfig;
  readonly features: FeatureFlags;
}

export const DEFAULT_CONFIG: OpenFoundryConfig = {
  server: {
    port: 3000,
    host: "0.0.0.0",
    logLevel: "info",
    corsOrigins: ["http://localhost:3000"],
  },
  database: {
    url: "postgresql://localhost:5432/openfoundry",
    poolSize: 10,
    ssl: false,
    migrationPath: "./migrations",
  },
  auth: {
    jwtPublicKey: "",
    jwtPrivateKey: "",
    tokenExpirySeconds: 3600,
    refreshTokenExpirySeconds: 86400,
    issuer: "openfoundry",
  },
  services: {
    gateway: { url: "http://localhost:8080", timeout: 30000 },
    multipass: { url: "http://localhost:8081", timeout: 30000 },
    ontology: { url: "http://localhost:8082", timeout: 30000 },
    objects: { url: "http://localhost:8083", timeout: 30000 },
    actions: { url: "http://localhost:8084", timeout: 30000 },
  },
  features: {},
};
