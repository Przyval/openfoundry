/**
 * Configuration loader for the OpenFoundry platform.
 *
 * Loads configuration from multiple sources with the following precedence
 * (highest to lowest): environment variables > config file > defaults.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, type OpenFoundryConfig } from "./config-schema.js";
import { applyEnvOverrides } from "./env-mapping.js";

export interface LoadConfigOptions {
  /** Path to the foundry.config.json file. Defaults to ./foundry.config.json */
  readonly configPath?: string;
  /** Environment variables to read from. Defaults to process.env */
  readonly env?: Record<string, string | undefined>;
}

/**
 * Deep merges a source object into a target object, returning a new object.
 * Arrays and primitive values in source overwrite those in target.
 * Nested objects are recursively merged.
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key as keyof T];
    const targetValue = target[key as keyof T];

    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      targetValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Partial<Record<string, unknown>>,
      );
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }

  return result as T;
}

/**
 * Reads and parses a JSON config file if it exists.
 * Returns an empty object if the file does not exist.
 */
function readConfigFile(configPath: string): Partial<OpenFoundryConfig> {
  const absolutePath = resolve(configPath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  const content = readFileSync(absolutePath, "utf-8");
  return JSON.parse(content) as Partial<OpenFoundryConfig>;
}

/**
 * Loads the OpenFoundry configuration by merging multiple sources.
 *
 * Precedence (highest to lowest):
 * 1. Environment variables
 * 2. Config file (foundry.config.json)
 * 3. Default values
 *
 * @param options - Optional overrides for config path and environment
 * @returns The fully resolved configuration
 */
export function loadConfig(options?: LoadConfigOptions): OpenFoundryConfig {
  const configPath = options?.configPath ?? "foundry.config.json";
  const env = options?.env ?? process.env;

  // Layer 1: Start with defaults
  const defaults = DEFAULT_CONFIG;

  // Layer 2: Merge config file on top
  const fileConfig = readConfigFile(configPath);
  const withFile = deepMerge(
    defaults as unknown as Record<string, unknown>,
    fileConfig as unknown as Partial<Record<string, unknown>>,
  ) as unknown as OpenFoundryConfig;

  // Layer 3: Apply environment variable overrides
  const withEnv = applyEnvOverrides(withFile, env);

  return withEnv;
}
