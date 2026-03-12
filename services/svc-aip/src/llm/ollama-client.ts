import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LlmClient,
} from "./llm-client.js";

// ---------------------------------------------------------------------------
// Ollama response shapes
// ---------------------------------------------------------------------------

interface OllamaChatResponse {
  message: { role: string; content: string };
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

// ---------------------------------------------------------------------------
// Ollama client — local LLM via HTTP
// ---------------------------------------------------------------------------

export class OllamaClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(options?: {
    baseUrl?: string;
    model?: string;
    embeddingModel?: string;
  }) {
    this.baseUrl = (options?.baseUrl ?? "http://localhost:11434").replace(
      /\/$/,
      "",
    );
    this.model = options?.model ?? "llama3";
    this.embeddingModel = options?.embeddingModel ?? "llama3";
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };

    if (options?.temperature !== undefined) {
      body.options = {
        ...(body.options as Record<string, unknown> | undefined),
        temperature: options.temperature,
      };
    }

    if (options?.maxTokens !== undefined) {
      body.options = {
        ...(body.options as Record<string, unknown> | undefined),
        num_predict: options.maxTokens,
      };
    }

    if (options?.stop !== undefined) {
      body.options = {
        ...(body.options as Record<string, unknown> | undefined),
        stop: options.stop,
      };
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as OllamaChatResponse;

    return {
      message: {
        role: "assistant",
        content: data.message.content,
      },
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      },
      model: data.model ?? this.model,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: text,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama Embeddings API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as OllamaEmbeddingResponse;
      results.push(data.embedding);
    }

    return results;
  }
}
