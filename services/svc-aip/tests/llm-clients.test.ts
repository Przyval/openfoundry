import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OpenAiClient } from "../src/llm/openai-client.js";
import { AnthropicClient } from "../src/llm/anthropic-client.js";
import { OllamaClient } from "../src/llm/ollama-client.js";
import { MockLlmClient } from "../src/llm/mock-client.js";
import { createLlmClient } from "../src/llm/create-client.js";
import type { ChatMessage } from "../src/llm/llm-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_MESSAGES: ChatMessage[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello" },
];

function mockFetchOnce(responseBody: unknown, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(responseBody),
    json: async () => responseBody,
  });
}

function mockFetchError(errorText: string, status = 500) {
  return vi.fn().mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => errorText,
  });
}

// ---------------------------------------------------------------------------
// OpenAI Client
// ---------------------------------------------------------------------------

describe("OpenAiClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a chat request and parses the response", async () => {
    const openaiResponse = {
      choices: [{ message: { role: "assistant", content: "Hi there!" } }],
      model: "gpt-4o",
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };

    const fetchMock = mockFetchOnce(openaiResponse);
    globalThis.fetch = fetchMock;

    const client = new OpenAiClient({
      baseUrl: "https://api.openai.com",
      apiKey: "test-key",
      model: "gpt-4o",
      embeddingModel: "text-embedding-3-small",
    });

    const result = await client.chat(TEST_MESSAGES, {
      temperature: 0.5,
      maxTokens: 100,
    });

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Hi there!");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(result.model).toBe("gpt-4o");

    // Verify the request
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toHaveLength(2);
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(100);
  });

  it("generates embeddings", async () => {
    const embeddingResponse = {
      data: [
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ],
    };

    const fetchMock = mockFetchOnce(embeddingResponse);
    globalThis.fetch = fetchMock;

    const client = new OpenAiClient({
      baseUrl: "https://api.openai.com",
      apiKey: "test-key",
      model: "gpt-4o",
      embeddingModel: "text-embedding-3-small",
    });

    const result = await client.embed(["hello", "world"]);

    expect(result).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("text-embedding-3-small");
    expect(body.input).toEqual(["hello", "world"]);
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError("Rate limit exceeded", 429);

    const client = new OpenAiClient({
      baseUrl: "https://api.openai.com",
      apiKey: "test-key",
      model: "gpt-4o",
      embeddingModel: "text-embedding-3-small",
    });

    await expect(client.chat(TEST_MESSAGES)).rejects.toThrow(
      "OpenAI API error 429: Rate limit exceeded",
    );
  });

  it("strips trailing slash from baseUrl", () => {
    const fetchMock = mockFetchOnce({
      choices: [{ message: { role: "assistant", content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    globalThis.fetch = fetchMock;

    const client = new OpenAiClient({
      baseUrl: "https://api.openai.com/",
      apiKey: "k",
      model: "m",
      embeddingModel: "e",
    });

    void client.chat(TEST_MESSAGES);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
  });
});

// ---------------------------------------------------------------------------
// Anthropic Client
// ---------------------------------------------------------------------------

describe("AnthropicClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a chat request with correct headers and parses content blocks", async () => {
    const anthropicResponse = {
      content: [
        { type: "text", text: "Hello from Claude!" },
      ],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 15, output_tokens: 8 },
    };

    const fetchMock = mockFetchOnce(anthropicResponse);
    globalThis.fetch = fetchMock;

    const client = new AnthropicClient({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-20250514",
    });

    const result = await client.chat(TEST_MESSAGES, { maxTokens: 200 });

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Hello from Claude!");
    expect(result.usage.promptTokens).toBe(15);
    expect(result.usage.completionTokens).toBe(8);
    expect(result.model).toBe("claude-sonnet-4-20250514");

    // Verify headers
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("sk-ant-test");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");

    // Verify system message is extracted
    const body = JSON.parse(init.body);
    expect(body.system).toBe("You are a helpful assistant.");
    expect(body.messages).toHaveLength(1); // only the user message
    expect(body.messages[0].role).toBe("user");
    expect(body.max_tokens).toBe(200);
  });

  it("defaults max_tokens to 4096 when not specified", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    globalThis.fetch = fetchMock;

    const client = new AnthropicClient({
      apiKey: "k",
      model: "claude-sonnet-4-20250514",
    });

    await client.chat([{ role: "user", content: "hi" }]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(4096);
  });

  it("maps stop to stop_sequences", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    globalThis.fetch = fetchMock;

    const client = new AnthropicClient({
      apiKey: "k",
      model: "claude-sonnet-4-20250514",
    });

    await client.chat([{ role: "user", content: "hi" }], {
      stop: ["END"],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stop_sequences).toEqual(["END"]);
  });

  it("throws on embed() with helpful message", async () => {
    const client = new AnthropicClient({
      apiKey: "k",
      model: "claude-sonnet-4-20250514",
    });

    await expect(client.embed(["test"])).rejects.toThrow(
      "Anthropic does not provide an embeddings API",
    );
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError("Unauthorized", 401);

    const client = new AnthropicClient({
      apiKey: "bad-key",
      model: "claude-sonnet-4-20250514",
    });

    await expect(client.chat(TEST_MESSAGES)).rejects.toThrow(
      "Anthropic API error 401: Unauthorized",
    );
  });

  it("handles response with no text blocks gracefully", async () => {
    const fetchMock = mockFetchOnce({
      content: [{ type: "tool_use", id: "123", name: "fn", input: {} }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    globalThis.fetch = fetchMock;

    const client = new AnthropicClient({
      apiKey: "k",
      model: "claude-sonnet-4-20250514",
    });

    const result = await client.chat([{ role: "user", content: "hi" }]);
    expect(result.message.content).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Ollama Client
// ---------------------------------------------------------------------------

describe("OllamaClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends a chat request to Ollama", async () => {
    const ollamaResponse = {
      message: { role: "assistant", content: "Hello from Ollama!" },
      model: "llama3",
      prompt_eval_count: 20,
      eval_count: 12,
    };

    const fetchMock = mockFetchOnce(ollamaResponse);
    globalThis.fetch = fetchMock;

    const client = new OllamaClient();

    const result = await client.chat(TEST_MESSAGES, { temperature: 0.7 });

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Hello from Ollama!");
    expect(result.usage.promptTokens).toBe(20);
    expect(result.usage.completionTokens).toBe(12);
    expect(result.model).toBe("llama3");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("llama3");
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0.7);
  });

  it("uses custom base URL", async () => {
    const fetchMock = mockFetchOnce({
      message: { role: "assistant", content: "ok" },
      model: "llama3",
    });
    globalThis.fetch = fetchMock;

    const client = new OllamaClient({
      baseUrl: "http://my-server:11434",
      model: "mistral",
    });

    await client.chat([{ role: "user", content: "hi" }]);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://my-server:11434/api/chat");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("mistral");
  });

  it("maps maxTokens to num_predict", async () => {
    const fetchMock = mockFetchOnce({
      message: { role: "assistant", content: "ok" },
      model: "llama3",
    });
    globalThis.fetch = fetchMock;

    const client = new OllamaClient();
    await client.chat([{ role: "user", content: "hi" }], { maxTokens: 50 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.options.num_predict).toBe(50);
  });

  it("generates embeddings one text at a time", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ embedding: [0.1, 0.2] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ embedding: [0.3, 0.4] }),
      });

    globalThis.fetch = fetchMock;

    const client = new OllamaClient();
    const result = await client.embed(["hello", "world"]);

    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url1] = fetchMock.mock.calls[0];
    expect(url1).toBe("http://localhost:11434/api/embeddings");

    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body1.prompt).toBe("hello");

    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body2.prompt).toBe("world");
  });

  it("throws on API error", async () => {
    globalThis.fetch = mockFetchError("model not found", 404);

    const client = new OllamaClient();
    await expect(client.chat(TEST_MESSAGES)).rejects.toThrow(
      "Ollama API error 404: model not found",
    );
  });

  it("does not send auth headers", async () => {
    const fetchMock = mockFetchOnce({
      message: { role: "assistant", content: "ok" },
      model: "llama3",
    });
    globalThis.fetch = fetchMock;

    const client = new OllamaClient();
    await client.chat([{ role: "user", content: "hi" }]);

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["x-api-key"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// MockLlmClient
// ---------------------------------------------------------------------------

describe("MockLlmClient", () => {
  it("returns deterministic chat responses", async () => {
    const client = new MockLlmClient();
    const result = await client.chat([{ role: "user", content: "hello" }]);

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBeTruthy();
    expect(result.model).toBe("mock");
  });

  it("returns code generation response for generate prompts", async () => {
    const client = new MockLlmClient();
    const result = await client.chat([
      { role: "user", content: "Generate a function" },
    ]);

    expect(result.message.content).toBe("return args.x + args.y;");
  });

  it("returns deterministic embeddings", async () => {
    const client = new MockLlmClient();
    const result = await client.embed(["test"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(4);

    // Same input should produce same output
    const result2 = await client.embed(["test"]);
    expect(result2).toEqual(result);
  });

  it("records lastMessages", async () => {
    const client = new MockLlmClient();
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
    await client.chat(messages);

    expect(client.lastMessages).toEqual(messages);
  });
});

// ---------------------------------------------------------------------------
// createLlmClient factory
// ---------------------------------------------------------------------------

describe("createLlmClient", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it("creates OpenAI client when provider is explicit", () => {
    const client = createLlmClient({ provider: "openai", apiKey: "test" });
    expect(client).toBeInstanceOf(OpenAiClient);
  });

  it("creates Anthropic client when provider is explicit", () => {
    const client = createLlmClient({ provider: "anthropic", apiKey: "test" });
    expect(client).toBeInstanceOf(AnthropicClient);
  });

  it("creates Ollama client when provider is explicit", () => {
    const client = createLlmClient({ provider: "ollama" });
    expect(client).toBeInstanceOf(OllamaClient);
  });

  it("creates Mock client when provider is explicit", () => {
    const client = createLlmClient({ provider: "mock" });
    expect(client).toBeInstanceOf(MockLlmClient);
  });

  it("auto-detects OpenAI from OPENAI_API_KEY env var", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_URL;

    const client = createLlmClient();
    expect(client).toBeInstanceOf(OpenAiClient);
  });

  it("auto-detects Anthropic from ANTHROPIC_API_KEY env var", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.OLLAMA_URL;

    const client = createLlmClient();
    expect(client).toBeInstanceOf(AnthropicClient);
  });

  it("auto-detects Ollama from OLLAMA_URL env var", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OLLAMA_URL = "http://localhost:11434";

    const client = createLlmClient();
    expect(client).toBeInstanceOf(OllamaClient);
  });

  it("falls back to MockLlmClient when no env vars are set", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_URL;

    const client = createLlmClient();
    expect(client).toBeInstanceOf(MockLlmClient);
  });

  it("prefers OPENAI_API_KEY over ANTHROPIC_API_KEY when both are set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const client = createLlmClient();
    expect(client).toBeInstanceOf(OpenAiClient);
  });

  it("explicit provider overrides env var detection", () => {
    process.env.OPENAI_API_KEY = "sk-test";

    const client = createLlmClient({ provider: "mock" });
    expect(client).toBeInstanceOf(MockLlmClient);
  });
});
