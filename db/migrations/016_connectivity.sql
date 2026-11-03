-- ============================================================================
-- CONNECTIVITY (Foundry connectivity v2: Connections, File/Table Imports, Virtual Tables)
-- ============================================================================
-- Kept byte-identical in scripts/migrate.sql and db/migrations/016_connectivity.sql so
-- the two schema sources cannot drift; services/svc-datasets/tests/connectivity-contract.test.ts
-- runs PgConnectivityStore against each of them.
--
-- A connection's `configuration` is stored in its read form: an encrypted property is the
-- name of a secret, never its value. The values live in connectivity_secrets, sealed with
-- AES-256-GCM by the service (CONNECTIVITY_SECRETS_KEY).
-- `seq` carries insertion order: listings order by it, never by created_time.
-- Tenant isolation follows 009_multi_tenancy.sql and 012_models.sql.
INSERT INTO organizations (rid, display_name, description)
VALUES ('org:default', 'Default Organization', 'Auto-created for pre-existing data')
ON CONFLICT (rid) DO NOTHING;

CREATE TABLE IF NOT EXISTS connectivity_connections (
    rid                TEXT PRIMARY KEY,
    seq                BIGSERIAL,
    org_rid            TEXT NOT NULL
                       DEFAULT COALESCE(NULLIF(current_setting('app.org_rid', true), ''), 'org:default')
                       REFERENCES organizations(rid),
    parent_folder_rid  TEXT NOT NULL,
    display_name       TEXT NOT NULL,
    export_settings    JSONB NOT NULL,
    worker             JSONB NOT NULL,
    configuration      JSONB NOT NULL,
    created_time       TIMESTAMPTZ NOT NULL,
    CONSTRAINT connectivity_connections_folder_name_key UNIQUE (org_rid, parent_folder_rid, display_name)
);

CREATE TABLE IF NOT EXISTS connectivity_secrets (
    connection_rid  TEXT NOT NULL REFERENCES connectivity_connections(rid),
    name            TEXT NOT NULL,
    sealed          TEXT NOT NULL,
    org_rid            TEXT NOT NULL
                       DEFAULT COALESCE(NULLIF(current_setting('app.org_rid', true), ''), 'org:default')
                       REFERENCES organizations(rid),
    PRIMARY KEY (connection_rid, name)
);

CREATE TABLE IF NOT EXISTS connectivity_imports (
    rid             TEXT PRIMARY KEY,
    seq             BIGSERIAL,
    org_rid            TEXT NOT NULL
                       DEFAULT COALESCE(NULLIF(current_setting('app.org_rid', true), ''), 'org:default')
                       REFERENCES organizations(rid),
    kind            TEXT NOT NULL CHECK (kind IN ('file', 'table')),
    connection_rid  TEXT NOT NULL REFERENCES connectivity_connections(rid),
    data            JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS connectivity_virtual_tables (
    rid             TEXT PRIMARY KEY,
    seq             BIGSERIAL,
    org_rid            TEXT NOT NULL
                       DEFAULT COALESCE(NULLIF(current_setting('app.org_rid', true), ''), 'org:default')
                       REFERENCES organizations(rid),
    connection_rid  TEXT NOT NULL REFERENCES connectivity_connections(rid),
    name            TEXT NOT NULL,
    parent_rid      TEXT NOT NULL,
    config          JSONB NOT NULL,
    markings        JSONB,
    CONSTRAINT connectivity_virtual_tables_parent_name_key UNIQUE (org_rid, parent_rid, name)
);

CREATE INDEX IF NOT EXISTS idx_connectivity_imports_connection ON connectivity_imports(connection_rid, kind, seq);

ALTER TABLE connectivity_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON connectivity_connections;
CREATE POLICY tenant_isolation ON connectivity_connections
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE connectivity_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE connectivity_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON connectivity_secrets;
CREATE POLICY tenant_isolation ON connectivity_secrets
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE connectivity_secrets FORCE ROW LEVEL SECURITY;

ALTER TABLE connectivity_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON connectivity_imports;
CREATE POLICY tenant_isolation ON connectivity_imports
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE connectivity_imports FORCE ROW LEVEL SECURITY;

ALTER TABLE connectivity_virtual_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON connectivity_virtual_tables;
CREATE POLICY tenant_isolation ON connectivity_virtual_tables
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE connectivity_virtual_tables FORCE ROW LEVEL SECURITY;
