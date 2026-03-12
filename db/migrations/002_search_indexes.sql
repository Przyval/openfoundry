-- ============================================================================
-- OpenFoundry: Full-Text Search & Vector Indexes
-- 002_search_indexes.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Trigram extension for fuzzy / LIKE-based searching
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- Vector extension (pgvector) for embedding-based similarity search
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- GIN indexes on JSONB columns for fast property lookups
-- ============================================================================

-- General-purpose containment queries:  WHERE properties @> '{"status":"open"}'
CREATE INDEX idx_objects_properties_gin
    ON objects USING GIN (properties jsonb_path_ops);

CREATE INDEX idx_object_types_properties_gin
    ON object_types USING GIN (properties jsonb_path_ops);

CREATE INDEX idx_action_types_parameters_gin
    ON action_types USING GIN (parameters jsonb_path_ops);

CREATE INDEX idx_interface_types_properties_gin
    ON interface_types USING GIN (properties jsonb_path_ops);

CREATE INDEX idx_query_types_parameters_gin
    ON query_types USING GIN (parameters jsonb_path_ops);

-- ============================================================================
-- Full-text search on object properties
-- ============================================================================

-- Materialised tsvector column for fast FTS on object property values.
-- We cast the entire JSONB blob to text, which captures every leaf value.
-- A dedicated generated column keeps the index always in sync.
ALTER TABLE objects
    ADD COLUMN tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(properties::text, ''))
    ) STORED;

CREATE INDEX idx_objects_fts ON objects USING GIN (tsv);

-- Full-text search on object type display names and descriptions
ALTER TABLE object_types
    ADD COLUMN tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            COALESCE(display_name, '') || ' ' ||
            COALESCE(description, '') || ' ' ||
            COALESCE(api_name, '')
        )
    ) STORED;

CREATE INDEX idx_object_types_fts ON object_types USING GIN (tsv);

-- Full-text search on ontologies
ALTER TABLE ontologies
    ADD COLUMN tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            COALESCE(display_name, '') || ' ' ||
            COALESCE(description, '') || ' ' ||
            COALESCE(api_name, '')
        )
    ) STORED;

CREATE INDEX idx_ontologies_fts ON ontologies USING GIN (tsv);

-- ============================================================================
-- Trigram indexes for fuzzy / partial-match searches
-- ============================================================================
CREATE INDEX idx_users_username_trgm
    ON users USING GIN (username gin_trgm_ops);

CREATE INDEX idx_object_types_api_name_trgm
    ON object_types USING GIN (api_name gin_trgm_ops);

CREATE INDEX idx_ontologies_api_name_trgm
    ON ontologies USING GIN (api_name gin_trgm_ops);

-- ============================================================================
-- Vector embeddings for semantic search
-- ============================================================================

-- Embedding column on objects for semantic similarity queries.
-- 1536 dimensions matches OpenAI text-embedding-3-small; adjust as needed.
ALTER TABLE objects
    ADD COLUMN embedding vector(1536);

CREATE INDEX idx_objects_embedding_hnsw
    ON objects USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Embedding column on object types for type-level semantic search.
ALTER TABLE object_types
    ADD COLUMN embedding vector(1536);

CREATE INDEX idx_object_types_embedding_hnsw
    ON object_types USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMIT;
