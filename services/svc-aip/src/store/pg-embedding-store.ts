import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import type {
  StoredEmbedding,
  StoreEmbeddingInput,
  SemanticSearchResult,
} from "./embedding-store.js";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface EmbeddingRow {
  rid: string;
  source_rid: string;
  source_type: string;
  content: string;
  embedding: string; // pgvector returns as string "[0.1,0.2,...]"
  model: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseVectorString(str: string): number[] {
  // pgvector returns "[0.1,0.2,...]"
  return str
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map(Number);
}

function vectorToString(arr: number[]): string {
  return `[${arr.join(",")}]`;
}

function rowToEmbedding(row: EmbeddingRow): StoredEmbedding {
  return {
    rid: row.rid,
    sourceRid: row.source_rid,
    sourceType: row.source_type,
    content: row.content,
    embedding: parseVectorString(row.embedding),
    model: row.model,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// PgEmbeddingStore — uses pgvector for similarity search
// ---------------------------------------------------------------------------

export class PgEmbeddingStore {
  constructor(private pool: pg.Pool) {}

  async store(input: StoreEmbeddingInput): Promise<StoredEmbedding> {
    const rid = generateRid("aip", "embedding").toString();

    const { rows } = await this.pool.query<EmbeddingRow>({
      text: `INSERT INTO aip_embeddings (rid, source_rid, source_type, content, embedding, model)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
      values: [
        rid,
        input.sourceRid,
        input.sourceType,
        input.content,
        vectorToString(input.embedding),
        input.model,
      ],
    });

    return rowToEmbedding(rows[0]);
  }

  async storeBatch(inputs: StoreEmbeddingInput[]): Promise<StoredEmbedding[]> {
    const results: StoredEmbedding[] = [];
    for (const input of inputs) {
      results.push(await this.store(input));
    }
    return results;
  }

  async search(
    queryEmbedding: number[],
    options?: { objectType?: string; limit?: number },
  ): Promise<SemanticSearchResult[]> {
    const limit = options?.limit ?? 10;
    const vecStr = vectorToString(queryEmbedding);

    let text: string;
    let values: unknown[];

    if (options?.objectType) {
      text = `SELECT rid, source_rid, source_type, content,
                     1 - (embedding <=> $1::vector) AS score
              FROM aip_embeddings
              WHERE source_type = $2
              ORDER BY embedding <=> $1::vector
              LIMIT $3`;
      values = [vecStr, options.objectType, limit];
    } else {
      text = `SELECT rid, source_rid, source_type, content,
                     1 - (embedding <=> $1::vector) AS score
              FROM aip_embeddings
              ORDER BY embedding <=> $1::vector
              LIMIT $2`;
      values = [vecStr, limit];
    }

    const { rows } = await this.pool.query<{
      rid: string;
      source_rid: string;
      source_type: string;
      content: string;
      score: number;
    }>({ text, values });

    return rows.map((row) => ({
      rid: row.source_rid,
      sourceRid: row.source_rid,
      sourceType: row.source_type,
      content: row.content,
      score: Number(row.score),
    }));
  }
}
