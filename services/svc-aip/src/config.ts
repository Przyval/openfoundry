/**
 * Service configuration resolved from environment variables.
 */
export interface AipServiceConfig {
  /** Port the HTTP server binds to. */
  readonly port: number;

  /** Host address to bind (0.0.0.0 for all interfaces). */
  readonly host: string;

  /** Log level. */
  readonly logLevel: string;

  /** Node environment. */
  readonly nodeEnv: string;

  /** PostgreSQL connection string.  When set, the PG stores are used instead of in-memory. */
  readonly databaseUrl?: string;

  /** LLM provider: "openai" | "anthropic" | "ollama". */
  readonly llmProvider: string;

  /** API key for the LLM provider. */
  readonly llmApiKey: string;

  /** Base URL for the LLM API (e.g. for Ollama or a custom endpoint). */
  readonly llmBaseUrl: string;

  /** Model identifier for chat completions. */
  readonly llmModel: string;

  /** Model identifier for embeddings. */
  readonly embeddingModel: string;
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

function detectLlmProvider(): string {
  const explicit = process.env.LLM_PROVIDER;
  if (explicit) return explicit;
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OLLAMA_URL) return "ollama";
  return "mock";
}

function detectLlmApiKey(provider: string): string {
  const explicit = process.env.LLM_API_KEY;
  if (explicit) return explicit;
  if (provider === "openai") return process.env.OPENAI_API_KEY ?? "";
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY ?? "";
  return "";
}

function detectLlmBaseUrl(provider: string): string {
  const explicit = process.env.LLM_BASE_URL;
  if (explicit) return explicit;
  if (provider === "openai") return process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  if (provider === "anthropic") return process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  if (provider === "ollama") return process.env.OLLAMA_URL ?? "http://localhost:11434";
  return "";
}

function detectLlmModel(provider: string): string {
  const explicit = process.env.LLM_MODEL;
  if (explicit) return explicit;
  if (provider === "openai") return "gpt-4o";
  if (provider === "anthropic") return "claude-sonnet-4-20250514";
  if (provider === "ollama") return "llama3";
  return "";
}

export function loadConfig(): AipServiceConfig {
  const llmProvider = detectLlmProvider();

  return {
    port: envInt("PORT", 8092),
    host: env("HOST", "0.0.0.0"),
    logLevel: env("LOG_LEVEL", "info"),
    nodeEnv: env("NODE_ENV", "development"),
    databaseUrl: process.env.DATABASE_URL || undefined,
    llmProvider,
    llmApiKey: detectLlmApiKey(llmProvider),
    llmBaseUrl: detectLlmBaseUrl(llmProvider),
    llmModel: detectLlmModel(llmProvider),
    embeddingModel: env("EMBEDDING_MODEL", "text-embedding-3-small"),
  };
}
