// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

/** The set of entity types that can appear in search results. */
export type SearchEntityType =
  | "ONTOLOGY"
  | "OBJECT_TYPE"
  | "OBJECT"
  | "DATASET"
  | "RESOURCE"
  | "FUNCTION"
  | "ACTION"
  | "USER"
  | "GROUP";

/** A single search result. */
export interface SearchResult {
  rid: string;
  entityType: SearchEntityType;
  title: string;
  description?: string;
  /** Text snippet with highlighted matches. */
  highlight?: string;
  /** Relevance score (higher is better). */
  score: number;
  metadata?: Record<string, unknown>;
}

/** Input query for the search engine. */
export interface SearchQuery {
  query: string;
  /** Filter results to specific entity types. */
  entityTypes?: SearchEntityType[];
  limit?: number;
  offset?: number;
}

/** Response envelope returned by the search engine. */
export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  query: string;
  durationMs: number;
}

/** Shape of an entity to be indexed. */
export interface IndexableEntity {
  rid: string;
  entityType: SearchEntityType;
  title: string;
  description?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

/** Common interface shared by all search engine implementations. */
export interface SearchEngine {
  search(query: SearchQuery): Promise<SearchResponse>;
  indexEntity(entity: IndexableEntity): Promise<void>;
  removeEntity(rid: string): Promise<void>;
  reindexAll(): Promise<{ indexed: number }>;
}
