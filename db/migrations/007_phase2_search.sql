-- ============================================================================
-- OpenFoundry: Phase 2 — Full-Text Search Index
-- 004_phase2_search.sql
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Unified search index table
-- --------------------------------------------------------------------------
CREATE TABLE search_index (
    rid           TEXT PRIMARY KEY,
    entity_type   TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    content       TEXT,
    search_vector tsvector,
    metadata      JSONB DEFAULT '{}',
    indexed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_index_entity_type ON search_index (entity_type);
CREATE INDEX idx_search_index_vector ON search_index USING GIN (search_vector);

-- --------------------------------------------------------------------------
-- Trigger: auto-generate search vector on INSERT / UPDATE
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_search_index_vector
    BEFORE INSERT OR UPDATE ON search_index
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

COMMIT;
