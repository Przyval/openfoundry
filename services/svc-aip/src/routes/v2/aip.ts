import type { FastifyInstance } from "fastify";
import { invalidArgument } from "@openfoundry/errors";
import { generateRid } from "@openfoundry/rid";
import type { LlmClient, ChatMessage } from "../../llm/llm-client.js";
import type { ConversationStore } from "../../store/conversation-store.js";
import type { EmbeddingStore } from "../../store/embedding-store.js";
import type { PgConversationStore } from "../../store/pg-conversation-store.js";
import type { PgEmbeddingStore } from "../../store/pg-embedding-store.js";

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

interface AipRouteOptions {
  llmClient: LlmClient;
  conversationStore: ConversationStore | PgConversationStore;
  embeddingStore: EmbeddingStore | PgEmbeddingStore;
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

interface QueryBody {
  query: string;
  ontologyRid?: string;
  context?: Record<string, unknown>;
}

interface GenerateFunctionBody {
  description: string;
  parameters?: Array<{ name: string; type: string }>;
  returnType?: string;
}

interface EmbeddingsBody {
  texts: string[];
  model?: string;
}

interface SemanticSearchBody {
  query: string;
  objectType?: string;
  limit?: number;
}

interface ChatBody {
  messages: Array<{ role: string; content: string }>;
  ontologyRid?: string;
  tools?: string[];
}

// ---------------------------------------------------------------------------
// AIP routes
// ---------------------------------------------------------------------------

export async function aipRoutes(
  app: FastifyInstance,
  opts: AipRouteOptions,
): Promise<void> {
  const { llmClient, conversationStore: _conversationStore, embeddingStore } = opts;

  // -----------------------------------------------------------------------
  // POST /aip/query — Natural language query against ontology
  // -----------------------------------------------------------------------
  app.post<{ Body: QueryBody }>("/aip/query", async (request, reply) => {
    const { query, ontologyRid, context } = request.body ?? ({} as QueryBody);

    if (!query) {
      throw invalidArgument("query", "is required");
    }

    const systemPrompt = buildOntologySystemPrompt(ontologyRid, context);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ];

    const response = await llmClient.chat(messages, { temperature: 0.3 });
    const content = response.message.content;

    // Attempt to parse structured response from LLM
    const parsed = tryParseStructuredResponse(content);

    return reply.status(200).send({
      answer: parsed.answer ?? content,
      sources: parsed.sources ?? [],
      confidence: parsed.confidence ?? 0.8,
    });
  });

  // -----------------------------------------------------------------------
  // POST /aip/generate-function — Generate a function from natural language
  // -----------------------------------------------------------------------
  app.post<{ Body: GenerateFunctionBody }>(
    "/aip/generate-function",
    async (request, reply) => {
      const { description, parameters, returnType } =
        request.body ?? ({} as GenerateFunctionBody);

      if (!description) {
        throw invalidArgument("description", "is required");
      }

      const paramList = parameters
        ? parameters.map((p) => `${p.name}: ${p.type}`).join(", ")
        : "";
      const retType = returnType ?? "unknown";

      const prompt = [
        "You are a TypeScript code generator. Generate a function based on the following description.",
        `Description: ${description}`,
        paramList ? `Parameters: ${paramList}` : "",
        `Return type: ${retType}`,
        "",
        "Return ONLY valid TypeScript code for the function body (the code inside the function).",
        "Do not include function signature or markdown formatting.",
      ]
        .filter(Boolean)
        .join("\n");

      const messages: ChatMessage[] = [{ role: "user", content: prompt }];
      const response = await llmClient.chat(messages, { temperature: 0.2 });

      const code = response.message.content.trim();
      const apiName = generateApiName(description);

      return reply.status(200).send({
        code,
        apiName,
        explanation: `Generated function "${apiName}" from: ${description}`,
      });
    },
  );

  // -----------------------------------------------------------------------
  // POST /aip/embeddings — Generate and store embeddings
  // -----------------------------------------------------------------------
  app.post<{ Body: EmbeddingsBody }>(
    "/aip/embeddings",
    async (request, reply) => {
      const { texts, model } = request.body ?? ({} as EmbeddingsBody);

      if (!texts || !Array.isArray(texts) || texts.length === 0) {
        throw invalidArgument("texts", "must be a non-empty array of strings");
      }

      const embeddings = await llmClient.embed(texts);
      const usedModel = model ?? "default";

      // Store the embeddings
      const inputs = texts.map((text, i) => ({
        sourceRid: generateRid("aip", "text").toString(),
        sourceType: "text",
        content: text,
        embedding: embeddings[i],
        model: usedModel,
      }));

      await Promise.resolve(embeddingStore.storeBatch(inputs));

      return reply.status(200).send({
        embeddings,
        model: usedModel,
      });
    },
  );

  // -----------------------------------------------------------------------
  // POST /aip/semantic-search — Vector similarity search
  // -----------------------------------------------------------------------
  app.post<{ Body: SemanticSearchBody }>(
    "/aip/semantic-search",
    async (request, reply) => {
      const { query, objectType, limit } =
        request.body ?? ({} as SemanticSearchBody);

      if (!query) {
        throw invalidArgument("query", "is required");
      }

      // Generate embedding for the query
      const [queryEmbedding] = await llmClient.embed([query]);

      const results = await Promise.resolve(
        embeddingStore.search(queryEmbedding, { objectType, limit }),
      );

      return reply.status(200).send({
        results: results.map((r) => ({
          rid: r.rid,
          objectType: r.sourceType,
          score: r.score,
          properties: { content: r.content },
        })),
      });
    },
  );

  // -----------------------------------------------------------------------
  // GET /aip/models — List available AI models
  // -----------------------------------------------------------------------
  app.get("/aip/models", async (_request, reply) => {
    const models = [
      {
        id: "gpt-4o",
        provider: "openai",
        capabilities: ["chat", "function-calling"],
      },
      {
        id: "gpt-4o-mini",
        provider: "openai",
        capabilities: ["chat", "function-calling"],
      },
      {
        id: "text-embedding-3-small",
        provider: "openai",
        capabilities: ["embeddings"],
      },
      {
        id: "text-embedding-3-large",
        provider: "openai",
        capabilities: ["embeddings"],
      },
      {
        id: "claude-sonnet-4-20250514",
        provider: "anthropic",
        capabilities: ["chat", "function-calling"],
      },
      {
        id: "claude-haiku-4-20250514",
        provider: "anthropic",
        capabilities: ["chat"],
      },
    ];

    return reply.status(200).send({ models });
  });

  // -----------------------------------------------------------------------
  // POST /aip/chat — Multi-turn chat with ontology context
  // -----------------------------------------------------------------------
  app.post<{ Body: ChatBody }>("/aip/chat", async (request, reply) => {
    const { messages, ontologyRid, tools } =
      request.body ?? ({} as ChatBody);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw invalidArgument("messages", "must be a non-empty array");
    }

    // Build the system message with ontology context
    const systemContent = buildChatSystemPrompt(ontologyRid, tools);
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemContent },
      ...messages.map((m) => ({
        role: m.role as ChatMessage["role"],
        content: m.content,
      })),
    ];

    const response = await llmClient.chat(chatMessages);

    return reply.status(200).send({
      message: {
        role: "assistant" as const,
        content: response.message.content,
      },
      model: response.model ?? "unknown",
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOntologySystemPrompt(
  ontologyRid?: string,
  context?: Record<string, unknown>,
): string {
  let prompt =
    "You are an AI assistant for the OpenFoundry data platform. " +
    "Answer questions about the user's data ontology accurately and concisely.";

  if (ontologyRid) {
    prompt += ` You are working within ontology: ${ontologyRid}.`;
  }

  if (context) {
    prompt += ` Additional context: ${JSON.stringify(context)}`;
  }

  prompt +=
    "\n\nWhen possible, structure your response as JSON with fields: " +
    '"answer" (string), "sources" (array of {type, rid, name}), "confidence" (number 0-1).';

  return prompt;
}

function buildChatSystemPrompt(
  ontologyRid?: string,
  tools?: string[],
): string {
  let prompt =
    "You are an AI assistant for the OpenFoundry data platform. " +
    "Help users explore, query, and manipulate their data ontology.";

  if (ontologyRid) {
    prompt += ` You are working within ontology: ${ontologyRid}.`;
  }

  if (tools && tools.length > 0) {
    prompt += ` You have access to these tools: ${tools.join(", ")}.`;
  }

  return prompt;
}

function tryParseStructuredResponse(content: string): {
  answer?: string;
  sources?: Array<{ type: string; rid: string; name: string }>;
  confidence?: number;
} {
  try {
    // Try to find JSON in the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Not valid JSON, use raw content
  }
  return {};
}

function generateApiName(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word, i) =>
      i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
}
