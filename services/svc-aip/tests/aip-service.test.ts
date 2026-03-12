import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server.js";
import { ConversationStore } from "../src/store/conversation-store.js";
import { EmbeddingStore } from "../src/store/embedding-store.js";
import { MockLlmClient } from "../src/llm/mock-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG = {
  port: 0,
  host: "127.0.0.1",
  logLevel: "silent",
  nodeEnv: "test",
  llmProvider: "openai",
  llmApiKey: "test-key",
  llmBaseUrl: "http://localhost:11434",
  llmModel: "test-model",
  embeddingModel: "test-embedding",
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let mockLlm: MockLlmClient;

beforeEach(async () => {
  mockLlm = new MockLlmClient();
  app = await createServer({
    config: TEST_CONFIG,
    llmClient: mockLlm,
    conversationStore: new ConversationStore(),
    embeddingStore: new EmbeddingStore(),
  });
});

// -------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------

describe("Health endpoints", () => {
  it("GET /status/health returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });

  it("GET /status/liveness returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/liveness" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });

  it("GET /status/readiness returns HEALTHY", async () => {
    const res = await app.inject({ method: "GET", url: "/status/readiness" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "HEALTHY" });
  });
});

// -------------------------------------------------------------------------
// POST /api/v2/aip/query
// -------------------------------------------------------------------------

describe("POST /api/v2/aip/query", () => {
  it("returns a structured answer from the LLM", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/query",
      payload: {
        query: "How many object types are in the ontology?",
        ontologyRid: "ri.ontology.main.ontology.test",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.answer).toBe("The ontology contains 3 object types.");
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0].name).toBe("Employee");
    expect(body.confidence).toBe(0.92);
  });

  it("returns 400 when query is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/query",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// -------------------------------------------------------------------------
// POST /api/v2/aip/generate-function
// -------------------------------------------------------------------------

describe("POST /api/v2/aip/generate-function", () => {
  it("generates a function from a description", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/generate-function",
      payload: {
        description: "Generate a sum of two numbers",
        parameters: [
          { name: "x", type: "number" },
          { name: "y", type: "number" },
        ],
        returnType: "number",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.code).toBe("return args.x + args.y;");
    expect(body.apiName).toBeTruthy();
    expect(body.explanation).toContain("Generated function");
  });

  it("returns 400 when description is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/generate-function",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// -------------------------------------------------------------------------
// POST /api/v2/aip/embeddings
// -------------------------------------------------------------------------

describe("POST /api/v2/aip/embeddings", () => {
  it("generates and stores embeddings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/embeddings",
      payload: {
        texts: ["Hello world", "Test embedding"],
        model: "test-model",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.embeddings).toHaveLength(2);
    expect(body.embeddings[0]).toHaveLength(4); // mock returns 4-dim vectors
    expect(body.model).toBe("test-model");
  });

  it("returns 400 when texts is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/embeddings",
      payload: { texts: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when texts is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/embeddings",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// -------------------------------------------------------------------------
// POST /api/v2/aip/semantic-search
// -------------------------------------------------------------------------

describe("POST /api/v2/aip/semantic-search", () => {
  it("returns search results after embeddings are stored", async () => {
    // First, store some embeddings
    await app.inject({
      method: "POST",
      url: "/api/v2/aip/embeddings",
      payload: {
        texts: ["TypeScript functions", "Data ontology design"],
      },
    });

    // Then search
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/semantic-search",
      payload: { query: "TypeScript", limit: 5 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]).toHaveProperty("rid");
    expect(body.results[0]).toHaveProperty("score");
  });

  it("returns 400 when query is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/semantic-search",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// -------------------------------------------------------------------------
// GET /api/v2/aip/models
// -------------------------------------------------------------------------

describe("GET /api/v2/aip/models", () => {
  it("returns a list of available models", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/aip/models",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.models).toBeDefined();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);

    const model = body.models[0];
    expect(model).toHaveProperty("id");
    expect(model).toHaveProperty("provider");
    expect(model).toHaveProperty("capabilities");
  });
});

// -------------------------------------------------------------------------
// POST /api/v2/aip/chat
// -------------------------------------------------------------------------

describe("POST /api/v2/aip/chat", () => {
  it("returns a chat response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/chat",
      payload: {
        messages: [
          { role: "user", content: "Tell me about the data" },
        ],
        ontologyRid: "ri.ontology.main.ontology.test",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.message).toBeDefined();
    expect(body.message.role).toBe("assistant");
    expect(body.message.content).toBeTruthy();
    expect(body.usage).toBeDefined();
    expect(typeof body.usage.promptTokens).toBe("number");
    expect(typeof body.usage.completionTokens).toBe("number");
  });

  it("supports multi-turn conversations", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/chat",
      payload: {
        messages: [
          { role: "user", content: "What is an ontology?" },
          { role: "assistant", content: "An ontology defines..." },
          { role: "user", content: "Can you give an example?" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    // The mock should have received all messages plus the system prompt
    expect(mockLlm.lastMessages.length).toBe(4); // 1 system + 3 user/assistant
  });

  it("returns 400 when messages is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/chat",
      payload: { messages: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when messages is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v2/aip/chat",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
