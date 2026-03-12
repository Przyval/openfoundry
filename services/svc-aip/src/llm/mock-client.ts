import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LlmClient,
} from "./llm-client.js";

// ---------------------------------------------------------------------------
// Mock LLM client — deterministic responses for tests and local development
// ---------------------------------------------------------------------------

export class MockLlmClient implements LlmClient {
  /** The most recent messages passed to chat(). Useful for test assertions. */
  lastMessages: ChatMessage[] = [];

  async chat(
    messages: ChatMessage[],
    _options?: ChatOptions,
  ): Promise<ChatResponse> {
    this.lastMessages = messages;
    const userMessage =
      messages.find((m) => m.role === "user")?.content ?? "";

    // Return different responses based on content
    if (userMessage.includes("generate") || userMessage.includes("Generate")) {
      return {
        message: {
          role: "assistant",
          content: "return args.x + args.y;",
        },
        usage: { promptTokens: 50, completionTokens: 20 },
        model: "mock",
      };
    }

    return {
      message: {
        role: "assistant",
        content: JSON.stringify({
          answer: "The ontology contains 3 object types.",
          sources: [
            {
              type: "objectType",
              rid: "ri.ontology.main.object-type.abc",
              name: "Employee",
            },
          ],
          confidence: 0.92,
        }),
      },
      usage: { promptTokens: 100, completionTokens: 50 },
      model: "mock",
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Return deterministic fake embeddings (4 dimensions for testing)
    return texts.map((text) => {
      const seed = text.length;
      return [
        Math.sin(seed),
        Math.cos(seed),
        Math.sin(seed * 2),
        Math.cos(seed * 2),
      ];
    });
  }
}
