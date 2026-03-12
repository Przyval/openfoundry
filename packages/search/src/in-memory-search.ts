import type {
  SearchEngine,
  SearchQuery,
  SearchResponse,
  SearchResult,
  IndexableEntity,
} from "./types.js";

// ---------------------------------------------------------------------------
// Default limits
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// InMemorySearchEngine
// ---------------------------------------------------------------------------

/**
 * A simple in-memory search engine useful for unit tests.
 *
 * Scoring is based on substring match frequency across title, description,
 * and content fields with weighted importance (title > description > content).
 */
export class InMemorySearchEngine implements SearchEngine {
  private readonly entities: Map<string, IndexableEntity> = new Map();

  async search(query: SearchQuery): Promise<SearchResponse> {
    const start = Date.now();
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(query.offset ?? 0, 0);
    const terms = query.query.toLowerCase().split(/\s+/).filter(Boolean);

    if (terms.length === 0) {
      return { results: [], totalCount: 0, query: query.query, durationMs: 0 };
    }

    const scored: SearchResult[] = [];

    for (const entity of this.entities.values()) {
      // Filter by entity type if specified.
      if (
        query.entityTypes &&
        query.entityTypes.length > 0 &&
        !query.entityTypes.includes(entity.entityType)
      ) {
        continue;
      }

      const score = this.scoreEntity(entity, terms);
      if (score > 0) {
        scored.push({
          rid: entity.rid,
          entityType: entity.entityType,
          title: entity.title,
          description: entity.description,
          highlight: this.buildHighlight(entity, terms),
          score,
          metadata: entity.metadata,
        });
      }
    }

    // Sort by score descending, then title ascending for determinism.
    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    const totalCount = scored.length;
    const results = scored.slice(offset, offset + limit);

    return {
      results,
      totalCount,
      query: query.query,
      durationMs: Date.now() - start,
    };
  }

  async indexEntity(entity: IndexableEntity): Promise<void> {
    this.entities.set(entity.rid, { ...entity });
  }

  async removeEntity(rid: string): Promise<void> {
    this.entities.delete(rid);
  }

  async reindexAll(): Promise<{ indexed: number }> {
    // In-memory engine has nothing external to reindex from — just return
    // the current count.
    return { indexed: this.entities.size };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private scoreEntity(entity: IndexableEntity, terms: string[]): number {
    let score = 0;

    const title = (entity.title ?? "").toLowerCase();
    const description = (entity.description ?? "").toLowerCase();
    const content = (entity.content ?? "").toLowerCase();

    for (const term of terms) {
      if (title.includes(term)) score += 3;
      if (description.includes(term)) score += 2;
      if (content.includes(term)) score += 1;
    }

    return score;
  }

  private buildHighlight(entity: IndexableEntity, terms: string[]): string {
    const text = [entity.title, entity.description, entity.content]
      .filter(Boolean)
      .join(" ");

    // Simple highlight: wrap first occurrence of each term in <mark> tags.
    let highlighted = text;
    for (const term of terms) {
      const regex = new RegExp(`(${escapeRegex(term)})`, "i");
      highlighted = highlighted.replace(regex, "<mark>$1</mark>");
    }

    // Truncate to a reasonable snippet length.
    if (highlighted.length > 200) {
      highlighted = highlighted.slice(0, 200) + "...";
    }

    return highlighted;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
