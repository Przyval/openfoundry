import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LlmClient,
} from "./llm-client.js";

// ---------------------------------------------------------------------------
// OpenAI-compatible response shapes
// ---------------------------------------------------------------------------

interface OpenAIChatChoice {
  message: { role: string; content: string };
}

interface OpenAIChatResponse {
  choices: OpenAIChatChoice[];
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface OpenAIEmbeddingData {
  embedding: number[];
}

interface OpenAIEmbeddingResponse {
  data: OpenAIEmbeddingData[];
}

// ---------------------------------------------------------------------------
// OpenAI-compatible client (works with OpenAI, Ollama, any compatible API)
// ---------------------------------------------------------------------------

export class OpenAiClient implements LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly embeddingModel: string;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    model: string;
    embeddingModel: string;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.embeddingModel = options.embeddingModel;
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.stop !== undefined) body.stop = options.stop;

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const choice = data.choices[0];

    return {
      message: {
        role: "assistant",
        content: choice.message.content,
      },
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
      model: data.model ?? this.model,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI Embeddings API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as OpenAIEmbeddingResponse;
    return data.data.map((d) => d.embedding);
  }
}
