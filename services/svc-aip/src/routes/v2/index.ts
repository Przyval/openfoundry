import type { FastifyInstance } from "fastify";
import type { LlmClient } from "../../llm/llm-client.js";
import type { ConversationStore } from "../../store/conversation-store.js";
import type { EmbeddingStore } from "../../store/embedding-store.js";
import type { PgConversationStore } from "../../store/pg-conversation-store.js";
import type { PgEmbeddingStore } from "../../store/pg-embedding-store.js";
import { aipRoutes } from "./aip.js";

export interface V2RouteOptions {
  llmClient: LlmClient;
  conversationStore: ConversationStore | PgConversationStore;
  embeddingStore: EmbeddingStore | PgEmbeddingStore;
}

export async function v2Routes(
  app: FastifyInstance,
  opts: V2RouteOptions,
): Promise<void> {
  await app.register(aipRoutes, {
    llmClient: opts.llmClient,
    conversationStore: opts.conversationStore,
    embeddingStore: opts.embeddingStore,
  });
}
