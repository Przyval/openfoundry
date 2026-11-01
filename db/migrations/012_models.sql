-- ============================================================================
-- MODELS (Foundry models v2: Models, Model Versions, Model Studios)
-- ============================================================================
-- Kept byte-identical in scripts/migrate.sql and db/migrations/012_models.sql so
-- the two schema sources cannot drift; services/svc-aip/tests/models-contract.test.ts
-- runs PgModelStore against each of them.
--
-- Models and Model Studios share one table because a display name may be used
-- once per folder across both, and one unique constraint enforces that.
-- `seq` carries insertion order: listings order by it, never by created_time,
-- because two rows created inside one millisecond share a timestamp.
--
-- Tenant isolation follows 009_multi_tenancy.sql: rows carry `org_rid` and a
-- row-level security policy matches it against `app.org_rid`. `org_rid` is
-- taken from that same session setting rather than written by the store, so a
-- row can only ever land in the tenant whose context inserted it. A session
-- with no tenant context writes `org:default`, as every pre-tenancy row does;
-- only a role that bypasses row-level security gets that far.
INSERT INTO organizations (rid, display_name, description)
VALUES ('org:default', 'Default Organization', 'Auto-created for pre-existing data')
ON CONFLICT (rid) DO NOTHING;

CREATE TABLE IF NOT EXISTS ml_resources (
    rid                TEXT PRIMARY KEY,
    seq                BIGSERIAL,
    org_rid            TEXT NOT NULL
                       DEFAULT COALESCE(NULLIF(current_setting('app.org_rid', true), ''), 'org:default')
                       REFERENCES organizations(rid),
    resource_type      TEXT NOT NULL CHECK (resource_type IN ('MODEL', 'MODEL_STUDIO')),
    display_name       TEXT NOT NULL,
    parent_folder_rid  TEXT NOT NULL,
    created_time       TIMESTAMPTZ NOT NULL,
    CONSTRAINT ml_resources_folder_name_key UNIQUE (org_rid, parent_folder_rid, display_name)
);

CREATE TABLE IF NOT EXISTS ml_model_versions (
    rid                   TEXT PRIMARY KEY,
    seq                   BIGSERIAL,
    org_rid               TEXT NOT NULL
                          DEFAULT COALESCE(NULLIF(current_setting('app.org_rid', true), ''), 'org:default')
                          REFERENCES organizations(rid),
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
CREATE INDEX IF NOT EXISTS idx_ml_resources_org ON ml_resources(org_rid);
CREATE INDEX IF NOT EXISTS idx_ml_model_versions_org ON ml_model_versions(org_rid);

ALTER TABLE ml_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ml_resources;
CREATE POLICY tenant_isolation ON ml_resources
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE ml_resources FORCE ROW LEVEL SECURITY;

ALTER TABLE ml_model_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ml_model_versions;
CREATE POLICY tenant_isolation ON ml_model_versions
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE ml_model_versions FORCE ROW LEVEL SECURITY;
