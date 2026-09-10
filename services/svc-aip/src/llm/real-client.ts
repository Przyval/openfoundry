import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LlmClient,
} from "./llm-client.js";

// ---------------------------------------------------------------------------
// Dynamic ontology schema — fetched from the OpenFoundry API at startup
// ---------------------------------------------------------------------------

let cachedSchema: string | null = null;
let schemaFetchedAt = 0;
const SCHEMA_TTL_MS = 5 * 60 * 1000; // Refresh every 5 minutes

/**
 * Fetch all ontologies and their object types from the ontology service,
 * then format as a readable schema for LLM context injection.
 */
async function fetchOntologySchema(): Promise<string> {
  const now = Date.now();
  if (cachedSchema && now - schemaFetchedAt < SCHEMA_TTL_MS) {
    return cachedSchema;
  }

  const ontologyUrl = process.env.ONTOLOGY_SERVICE_URL ?? "http://localhost:8081";

  try {
    const ontRes = await fetch(`${ontologyUrl}/api/v2/ontologies`);
    if (!ontRes.ok) throw new Error(`HTTP ${ontRes.status}`);
    const ontData = (await ontRes.json()) as { data: Array<{ rid: string; apiName: string; displayName?: string }> };

    const sections: string[] = [];

    for (const ont of ontData.data) {
      const metaRes = await fetch(`${ontologyUrl}/api/v2/ontologies/${ont.rid}/fullMetadata`);
      if (!metaRes.ok) continue;
      const meta = (await metaRes.json()) as {
        objectTypes: Array<{
          apiName: string;
          displayName?: string;
          primaryKeyApiName?: string;
          properties: Record<string, { type: string; nullable?: boolean; displayName?: string }>;
        }>;
        linkTypes?: Array<{
          apiName: string;
          objectTypeApiName: string;
          linkedObjectTypeApiName: string;
          cardinality: string;
        }>;
      };

      sections.push(`## Ontology: ${ont.displayName ?? ont.apiName}\n`);

      for (const ot of meta.objectTypes) {
        sections.push(`### ${ot.displayName ?? ot.apiName}`);
        sections.push(`Primary key: ${ot.primaryKeyApiName ?? "id"}`);
        sections.push("| Property | Type | Nullable |");
        sections.push("|----------|------|----------|");
        for (const [name, def] of Object.entries(ot.properties)) {
          sections.push(`| ${name} | ${def.type} | ${def.nullable ? "yes" : "no"} |`);
        }
        sections.push("");
      }

      if (meta.linkTypes && meta.linkTypes.length > 0) {
        sections.push("### Relationships");
        for (const lt of meta.linkTypes) {
          sections.push(`- ${lt.objectTypeApiName} —[${lt.apiName}]→ ${lt.linkedObjectTypeApiName} (${lt.cardinality})`);
        }
        sections.push("");
      }
    }

    cachedSchema = sections.join("\n");
    schemaFetchedAt = now;
    console.log(`[LLM] Ontology schema refreshed: ${cachedSchema.length} chars from ${ontData.data.length} ontologies`);
    return cachedSchema;
  } catch (err) {
    console.warn("[LLM] Failed to fetch ontology schema, using fallback:", err);
    return cachedSchema ?? "No ontology schema available. Answer based on general knowledge.";
  }
}

// ---------------------------------------------------------------------------
// OntologyAwareLlmClient — wraps a real LLM client with dynamic schema
// ---------------------------------------------------------------------------

/**
 * Wraps a real LLM client (Anthropic, OpenAI, Ollama, GLM) to automatically
 * enrich system prompts with the full ontology schema — fetched dynamically
 * from the running ontology service.
 *
 * Supports multiple ontologies (Sanocare Kelava, Healthcare, etc.) — all
 * schemas are included so the LLM understands every object type and relationship.
 */
export class OntologyAwareLlmClient implements LlmClient {
  readonly inner: LlmClient;
  private readonly providerName: string;

  constructor(inner: LlmClient, providerName: string) {
    this.inner = inner;
    this.providerName = providerName;
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const enriched = await this.enrichMessages(messages);
    return this.inner.chat(enriched, options);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.inner.embed(texts);
  }

  private async enrichMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const systemIdx = messages.findIndex((m) => m.role === "system");

    if (systemIdx >= 0) {
      const existing = messages[systemIdx].content;
      // Skip if already enriched
      if (existing.includes("Ontology:") && existing.includes("Primary key:")) {
        return messages;
      }

      const schema = await fetchOntologySchema();

      const enrichedMessages = [...messages];
      enrichedMessages[systemIdx] = {
        ...enrichedMessages[systemIdx],
        content:
          existing +
          "\n\n" +
          schema +
          `\n\nYou are powered by ${this.providerName}. Answer in the user's language (Indonesian or English). Use the ontology schema above to provide accurate, data-driven answers.`,
      };
      return enrichedMessages;
    }

    return messages;
  }
}
