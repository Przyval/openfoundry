-- ============================================================================
-- OpenFoundry: Phase 2 - Ontology Interfaces & Shared Property Types
-- 004_ontology_interfaces_shared_props.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- INTERFACE TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS interface_types (
    rid                 TEXT PRIMARY KEY,
    ontology_rid        TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name            TEXT NOT NULL,
    display_name        TEXT,
    description         TEXT,
    properties          JSONB NOT NULL DEFAULT '{}',
    extends_interfaces  TEXT[] DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_interface_types_ontology
    ON interface_types (ontology_rid);

-- Only create trigger if table was just created (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_interface_types_updated_at'
    ) THEN
        CREATE TRIGGER trg_interface_types_updated_at
            BEFORE UPDATE ON interface_types
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END
$$;

-- ============================================================================
-- SHARED PROPERTY TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS shared_property_types (
    rid             TEXT PRIMARY KEY,
    ontology_rid    TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name        TEXT NOT NULL,
    display_name    TEXT,
    data_type       TEXT NOT NULL,
    description     TEXT,
    validation      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_shared_property_types_ontology
    ON shared_property_types (ontology_rid);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_shared_property_types_updated_at'
    ) THEN
        CREATE TRIGGER trg_shared_property_types_updated_at
            BEFORE UPDATE ON shared_property_types
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END
$$;

-- ============================================================================
-- ADD implements_interfaces TO object_types
-- ============================================================================
ALTER TABLE object_types ADD COLUMN IF NOT EXISTS implements_interfaces TEXT[] DEFAULT '{}';

COMMIT;
