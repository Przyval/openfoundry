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
  model?: string;
  ontologyRid?: string;
  sessionId?: string;
  tools?: string[];
}

interface SessionEntry {
  messages: Array<{ role: string; content: string }>;
  ontologyRid?: string;
  model?: string;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// In-memory session store (conversation history)
// ---------------------------------------------------------------------------

const sessions = new Map<string, SessionEntry>();

// Evict stale sessions every 10 minutes (sessions older than 1 hour)
const SESSION_TTL_MS = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

function generateSessionId(): string {
  return `ses-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  // POST /aip/chat — Multi-turn chat with ontology context + sessions
  // -----------------------------------------------------------------------
  app.post<{ Body: ChatBody }>("/aip/chat", async (request, reply) => {
    const { messages, model: _requestedModel, ontologyRid, sessionId: incomingSessionId, tools } =
      request.body ?? ({} as ChatBody);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw invalidArgument("messages", "must be a non-empty array");
    }

    // Session handling — restore or create
    const sessionId = incomingSessionId ?? generateSessionId();
    let session = sessions.get(sessionId);

    if (!session) {
      session = {
        messages: [],
        ontologyRid,
        updatedAt: Date.now(),
      };
      sessions.set(sessionId, session);
    }

    // Append incoming user messages to session history
    for (const m of messages) {
      session.messages.push({ role: m.role, content: m.content });
    }
    session.updatedAt = Date.now();

    // Build the full message list: system + session history
    const systemContent = buildChatSystemPrompt(ontologyRid ?? session.ontologyRid, tools);
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemContent },
      ...session.messages.map((m) => ({
        role: m.role as ChatMessage["role"],
        content: m.content,
      })),
    ];

    const response = await llmClient.chat(chatMessages);

    // Append assistant response to session history
    session.messages.push({
      role: "assistant",
      content: response.message.content,
    });

    return reply.status(200).send({
      message: {
        role: "assistant" as const,
        content: response.message.content,
      },
      model: response.model ?? "unknown",
      sessionId,
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
      },
    });
  });

  // -----------------------------------------------------------------------
  // POST /aip/agents — List available AI agents
  // -----------------------------------------------------------------------
  app.post("/aip/agents", async (_request, reply) => {
    const agents = [
      {
        rid: "ri.aip.main.agent.ontology-explorer",
        displayName: "Ontology Explorer",
        description:
          "Explores and queries the pest control ontology. Can retrieve customer, technician, job, and product data.",
        capabilities: [
          "ontology-query",
          "data-summarization",
          "natural-language-search",
        ],
        status: "active",
        icon: "database",
      },
      {
        rid: "ri.aip.main.agent.scheduling-assistant",
        displayName: "Scheduling Assistant",
        description:
          "Helps manage and optimize technician schedules. Can suggest optimal job assignments based on location, specialization, and availability.",
        capabilities: [
          "schedule-optimization",
          "technician-matching",
          "conflict-detection",
        ],
        status: "active",
        icon: "calendar",
      },
      {
        rid: "ri.aip.main.agent.inventory-manager",
        displayName: "Inventory Manager",
        description:
          "Monitors treatment product stock levels and generates restock alerts. Can forecast usage based on upcoming jobs.",
        capabilities: [
          "stock-monitoring",
          "restock-alerts",
          "usage-forecasting",
        ],
        status: "active",
        icon: "box",
      },
      {
        rid: "ri.aip.main.agent.revenue-analyst",
        displayName: "Revenue Analyst",
        description:
          "Analyses revenue data, generates reports, and identifies trends across customers, jobs, and time periods.",
        capabilities: [
          "revenue-analysis",
          "trend-detection",
          "report-generation",
        ],
        status: "active",
        icon: "chart",
      },
      {
        rid: "ri.aip.main.agent.code-generator",
        displayName: "Code Generator",
        description:
          "Generates TypeScript functions from natural language descriptions for use in the Functions workflow.",
        capabilities: [
          "code-generation",
          "typescript",
          "function-scaffolding",
        ],
        status: "active",
        icon: "code",
      },
    ];

    return reply.status(200).send({ data: agents });
  });

  // -----------------------------------------------------------------------
  // GET /aip/sessions/:sessionId — Retrieve session conversation history
  // -----------------------------------------------------------------------
  app.get<{ Params: { sessionId: string } }>(
    "/aip/sessions/:sessionId",
    async (request, reply) => {
      const { sessionId } = request.params;
      const session = sessions.get(sessionId);

      if (!session) {
        return reply.status(404).send({
          errorCode: "NOT_FOUND",
          errorName: "SessionNotFound",
          errorInstanceId: crypto.randomUUID(),
          parameters: { sessionId },
          statusCode: 404,
        });
      }

      return reply.status(200).send({
        sessionId,
        messages: session.messages,
        ontologyRid: session.ontologyRid,
        model: session.model,
      });
    },
  );

  // -----------------------------------------------------------------------
  // DELETE /aip/sessions/:sessionId — Clear a session
  // -----------------------------------------------------------------------
  app.delete<{ Params: { sessionId: string } }>(
    "/aip/sessions/:sessionId",
    async (request, reply) => {
      const { sessionId } = request.params;
      sessions.delete(sessionId);
      return reply.status(204).send();
    },
  );
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
    "You are an AI assistant for the OpenFoundry data platform, " +
    "specializing in pest control business operations. " +
    "Help users explore, query, and manipulate their data ontology. " +
    "Format your responses using markdown with bold text, bullet lists, and tables where appropriate.\n\n" +
    "The ontology contains these object types:\n" +
    "- **Customer** — clients with properties: customerId, name, status, address, city, monthlyRate, contractType\n" +
    "- **Technician** — field technicians: technicianId, name, status, rating, specialization, phone\n" +
    "- **ServiceJob** — pest control jobs: jobId, customerId, customerName, technicianId, technicianName, scheduledDate, pestType, priority, status, amountCharged, customerRating\n" +
    "- **TreatmentProduct** — chemicals and equipment: productId, name, stockQty, minStockLevel, unit, category, supplier\n" +
    "- **Invoice** — billing records: invoiceId, customerId, totalAmount, status, dueDate\n" +
    "- **Schedule** — daily schedules: scheduleId, date, technicianId, customerId, status\n";

  if (ontologyRid) {
    prompt += `\nYou are working within ontology: ${ontologyRid}.`;
  }

  if (tools && tools.length > 0) {
    prompt += `\nYou have access to these tools: ${tools.join(", ")}.`;
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
