import type { LlmClient } from "./llm-client.js";
import { OpenAiClient } from "./openai-client.js";
import { AnthropicClient } from "./anthropic-client.js";
import { OllamaClient } from "./ollama-client.js";
import { MockLlmClient } from "./mock-client.js";

// ---------------------------------------------------------------------------
// Supported provider names
// ---------------------------------------------------------------------------

export type LlmProvider = "openai" | "anthropic" | "ollama" | "mock";

// ---------------------------------------------------------------------------
// Factory options — all optional; auto-detected from env when omitted
// ---------------------------------------------------------------------------

export interface CreateLlmClientOptions {
  /** Explicitly select a provider. When omitted, auto-detected from env vars. */
  provider?: LlmProvider;
  /** Override the chat model identifier. */
  model?: string;
  /** Override the embedding model identifier. */
  embeddingModel?: string;
  /** Override the base URL for the LLM API. */
  baseUrl?: string;
  /** Override the API key. */
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Auto-detection logic
// ---------------------------------------------------------------------------

function detectProvider(): LlmProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OLLAMA_URL) return "ollama";
  return "mock";
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create an LLM client.
 *
 * When no `provider` is given, the factory inspects environment variables to
 * choose the right backend:
 *
 * - `OPENAI_API_KEY`    → OpenAI
 * - `ANTHROPIC_API_KEY` → Anthropic
 * - `OLLAMA_URL`        → Ollama (local)
 * - (none)              → MockLlmClient (safe for tests / dev)
 */
export function createLlmClient(options: CreateLlmClientOptions = {}): LlmClient {
  const provider = options.provider ?? detectProvider();

  switch (provider) {
    case "openai":
      return new OpenAiClient({
        baseUrl: options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
        apiKey: options.apiKey ?? process.env.OPENAI_API_KEY ?? "",
        model: options.model ?? "gpt-4o",
        embeddingModel: options.embeddingModel ?? "text-embedding-3-small",
      });

    case "anthropic":
      return new AnthropicClient({
        apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
        model: options.model ?? "claude-sonnet-4-20250514",
        baseUrl: options.baseUrl ?? process.env.ANTHROPIC_BASE_URL,
      });

    case "ollama":
      return new OllamaClient({
        baseUrl: options.baseUrl ?? process.env.OLLAMA_URL ?? "http://localhost:11434",
        model: options.model ?? "llama3",
        embeddingModel: options.embeddingModel ?? "llama3",
      });

    case "mock":
      return new MockLlmClient();

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown LLM provider: ${_exhaustive}`);
    }
  }
}
