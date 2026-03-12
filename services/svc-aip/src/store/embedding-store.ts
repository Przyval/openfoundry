import { generateRid } from "@openfoundry/rid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredEmbedding {
  rid: string;
  sourceRid: string;
  sourceType: string;
  content: string;
  embedding: number[];
  model: string;
  createdAt: string;
}

export interface StoreEmbeddingInput {
  sourceRid: string;
  sourceType: string;
  content: string;
  embedding: number[];
  model: string;
}

export interface SemanticSearchResult {
  rid: string;
  sourceRid: string;
  sourceType: string;
  content: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ---------------------------------------------------------------------------
// EmbeddingStore — in-memory with cosine similarity search
// ---------------------------------------------------------------------------

export class EmbeddingStore {
  private readonly embeddings = new Map<string, StoredEmbedding>();

  store(input: StoreEmbeddingInput): StoredEmbedding {
    const now = new Date().toISOString();
    const rid = generateRid("aip", "embedding").toString();
    const stored: StoredEmbedding = {
      rid,
      sourceRid: input.sourceRid,
      sourceType: input.sourceType,
      content: input.content,
      embedding: input.embedding,
      model: input.model,
      createdAt: now,
    };

    this.embeddings.set(rid, stored);
    return stored;
  }

  storeBatch(inputs: StoreEmbeddingInput[]): StoredEmbedding[] {
    return inputs.map((input) => this.store(input));
  }

  search(
    queryEmbedding: number[],
    options?: { objectType?: string; limit?: number },
  ): SemanticSearchResult[] {
    const limit = options?.limit ?? 10;
    const results: SemanticSearchResult[] = [];

    for (const stored of this.embeddings.values()) {
      if (options?.objectType && stored.sourceType !== options.objectType) {
        continue;
      }

      const score = cosineSimilarity(queryEmbedding, stored.embedding);
      results.push({
        rid: stored.sourceRid,
        sourceRid: stored.sourceRid,
        sourceType: stored.sourceType,
        content: stored.content,
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getAll(): StoredEmbedding[] {
    return Array.from(this.embeddings.values());
  }
}
