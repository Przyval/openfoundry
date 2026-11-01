-- ============================================================================
-- MODELS (Foundry models v2: Models, Model Versions, Model Studios)
-- ============================================================================
-- Kept byte-identical in scripts/migrate.sql and db/migrations/012_models.sql so
-- the two schema sources cannot drift; svc-aip writes exactly these columns and
-- services/svc-aip/tests/models-pg-schema.test.ts asserts that.
--
-- Models and Model Studios share one table because a display name may be used
-- once per folder across both, and one unique constraint enforces that.
-- `seq` carries insertion order: listings order by it, never by created_time,
-- because two rows created inside one millisecond share a timestamp.
CREATE TABLE IF NOT EXISTS ml_resources (
    rid                TEXT PRIMARY KEY,
    seq                BIGSERIAL,
    resource_type      TEXT NOT NULL CHECK (resource_type IN ('MODEL', 'MODEL_STUDIO')),
    display_name       TEXT NOT NULL,
    parent_folder_rid  TEXT NOT NULL,
    created_time       TIMESTAMPTZ NOT NULL,
    CONSTRAINT ml_resources_folder_name_key UNIQUE (parent_folder_rid, display_name)
);

CREATE TABLE IF NOT EXISTS ml_model_versions (
    rid                   TEXT PRIMARY KEY,
    seq                   BIGSERIAL,
    model_rid             TEXT NOT NULL REFERENCES ml_resources(rid),
    branch                TEXT NOT NULL,
    model_api             JSONB NOT NULL,
    conda_requirements    JSONB NOT NULL,
    backing_repositories  JSONB NOT NULL,
    model_files           JSONB NOT NULL,
    source                JSONB NOT NULL,
    created_time          TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ml_model_versions_model_branch ON ml_model_versions(model_rid, branch, seq);
