import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LlmClient,
} from "./llm-client.js";

// ---------------------------------------------------------------------------
// Anthropic response shapes
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type: string;
  text: string;
}

interface AnthropicChatResponse {
  content: AnthropicContentBlock[];
  model?: string;
  usage: { input_tokens: number; output_tokens: number };
}

// ---------------------------------------------------------------------------
// Anthropic Claude client
// ---------------------------------------------------------------------------

export class AnthropicClient implements LlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: {
    apiKey: string;
    model: string;
    embeddingModel?: string;
    baseUrl?: string;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(
      /\/$/,
      "",
    );
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    // Anthropic expects system messages separately
    let systemPrompt: string | undefined;
    const apiMessages: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = msg.content;
      } else {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: apiMessages,
      max_tokens: options?.maxTokens ?? 4096,
    };

    if (systemPrompt !== undefined) body.system = systemPrompt;
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.stop !== undefined) body.stop_sequences = options.stop;

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as AnthropicChatResponse;
    const textBlock = data.content.find((b) => b.type === "text");

    return {
      message: {
        role: "assistant",
        content: textBlock?.text ?? "",
      },
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      },
      model: data.model ?? this.model,
    };
  }

  async embed(_texts: string[]): Promise<number[][]> {
    // Anthropic does not have a native embedding API.
    // Fall back to a simple hash-based placeholder.
    // In production, you would use a separate embedding provider.
    throw new Error(
      "Anthropic does not provide an embeddings API. " +
        "Configure an OpenAI-compatible embedding endpoint instead.",
    );
  }
}
