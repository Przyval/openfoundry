-- ============================================================================
-- OpenFoundry: Phase 1 Tables
-- 003_phase1_tables.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- ALTER EXISTING TABLES
-- ============================================================================

-- Add missing columns to datasets
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS parent_folder_rid TEXT;

-- ============================================================================
-- ACTION REGISTRATIONS
-- ============================================================================
CREATE TABLE action_registrations (
    rid              TEXT PRIMARY KEY,
    api_name         TEXT UNIQUE NOT NULL,
    display_name     TEXT,
    parameters       JSONB NOT NULL DEFAULT '{}',
    modified_entities JSONB DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'EXPERIMENTAL', 'DEPRECATED')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_registrations_status ON action_registrations (status);

CREATE TRIGGER trg_action_registrations_updated_at
    BEFORE UPDATE ON action_registrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ACTION EXECUTIONS
-- ============================================================================
CREATE TABLE action_executions (
    rid              TEXT PRIMARY KEY,
    action_api_name  TEXT NOT NULL,
    parameters       JSONB NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'RUNNING'
                     CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    result           JSONB,
    error            TEXT
);

CREATE INDEX idx_action_executions_api_name ON action_executions (action_api_name);
CREATE INDEX idx_action_executions_status ON action_executions (status);
CREATE INDEX idx_action_executions_started ON action_executions (started_at);

-- ============================================================================
-- DATASET BRANCHES
-- ============================================================================
CREATE TABLE dataset_branches (
    rid          TEXT PRIMARY KEY,
    dataset_rid  TEXT NOT NULL REFERENCES datasets(rid) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (dataset_rid, name)
);

CREATE INDEX idx_dataset_branches_dataset ON dataset_branches (dataset_rid);

-- ============================================================================
-- DATASET TRANSACTIONS
-- ============================================================================
CREATE TABLE dataset_transactions (
    rid          TEXT PRIMARY KEY,
    dataset_rid  TEXT NOT NULL REFERENCES datasets(rid) ON DELETE CASCADE,
    branch_rid   TEXT NOT NULL REFERENCES dataset_branches(rid) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN', 'COMMITTED', 'ABORTED')),
    type         TEXT NOT NULL
                 CHECK (type IN ('UPDATE', 'APPEND', 'SNAPSHOT')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dataset_transactions_dataset ON dataset_transactions (dataset_rid);
CREATE INDEX idx_dataset_transactions_branch ON dataset_transactions (branch_rid);
CREATE INDEX idx_dataset_transactions_status ON dataset_transactions (status);

CREATE TRIGGER trg_dataset_transactions_updated_at
    BEFORE UPDATE ON dataset_transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- DATASET FILES
-- ============================================================================
CREATE TABLE dataset_files (
    dataset_rid     TEXT NOT NULL REFERENCES datasets(rid) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    size            BIGINT,
    content_type    TEXT,
    transaction_rid TEXT REFERENCES dataset_transactions(rid) ON DELETE SET NULL,
    s3_key          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (dataset_rid, path)
);

CREATE INDEX idx_dataset_files_transaction ON dataset_files (transaction_rid);

-- ============================================================================
-- COMPASS RESOURCES
-- ============================================================================
CREATE TABLE compass_resources (
    rid          TEXT PRIMARY KEY,
    type         TEXT NOT NULL
                 CHECK (type IN ('FOLDER', 'PROJECT', 'DATASET', 'ONTOLOGY', 'FILE')),
    name         TEXT NOT NULL,
    path         TEXT NOT NULL,
    parent_rid   TEXT REFERENCES compass_resources(rid) ON DELETE CASCADE,
    description  TEXT,
    created_by   TEXT,
    markings     TEXT[] DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (parent_rid, name)
);

CREATE INDEX idx_compass_resources_type ON compass_resources (type);
CREATE INDEX idx_compass_resources_parent ON compass_resources (parent_rid);
CREATE INDEX idx_compass_resources_path ON compass_resources (path);
CREATE INDEX idx_compass_resources_created_by ON compass_resources (created_by);

CREATE TRIGGER trg_compass_resources_updated_at
    BEFORE UPDATE ON compass_resources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- COMPASS LINEAGE EDGES
-- ============================================================================
CREATE TABLE compass_lineage_edges (
    rid          TEXT PRIMARY KEY,
    source_rid   TEXT NOT NULL,
    target_rid   TEXT NOT NULL,
    edge_type    TEXT NOT NULL
                 CHECK (edge_type IN ('DERIVED_FROM', 'PRODUCES', 'CONSUMES', 'TRANSFORMS', 'COPIES', 'JOINS')),
    metadata     JSONB DEFAULT '{}',
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lineage_edges_source ON compass_lineage_edges (source_rid);
CREATE INDEX idx_lineage_edges_target ON compass_lineage_edges (target_rid);
CREATE INDEX idx_lineage_edges_type ON compass_lineage_edges (edge_type);

-- ============================================================================
-- SENTINEL MONITORS
-- ============================================================================
CREATE TABLE sentinel_monitors (
    rid               TEXT PRIMARY KEY,
    name              TEXT UNIQUE NOT NULL,
    description       TEXT,
    object_type       TEXT,
    trigger_def       JSONB NOT NULL DEFAULT '{}',
    effects           JSONB NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'PAUSED', 'ERROR')),
    last_triggered_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sentinel_monitors_status ON sentinel_monitors (status);
CREATE INDEX idx_sentinel_monitors_object_type ON sentinel_monitors (object_type);

CREATE TRIGGER trg_sentinel_monitors_updated_at
    BEFORE UPDATE ON sentinel_monitors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SENTINEL EXECUTIONS
-- ============================================================================
CREATE TABLE sentinel_executions (
    rid              TEXT PRIMARY KEY,
    monitor_rid      TEXT NOT NULL REFERENCES sentinel_monitors(rid) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'RUNNING'
                     CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILURE')),
    trigger_data     JSONB,
    effect_results   JSONB,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    error            TEXT
);

CREATE INDEX idx_sentinel_executions_monitor ON sentinel_executions (monitor_rid);
CREATE INDEX idx_sentinel_executions_status ON sentinel_executions (status);
CREATE INDEX idx_sentinel_executions_started ON sentinel_executions (started_at);

-- ============================================================================
-- WEBHOOKS
-- ============================================================================
CREATE TABLE webhooks (
    rid              TEXT PRIMARY KEY,
    name             TEXT UNIQUE NOT NULL,
    url              TEXT NOT NULL,
    secret           TEXT,
    events           TEXT[] DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'PAUSED', 'FAILED')),
    failure_count    INTEGER NOT NULL DEFAULT 0,
    last_delivery_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_status ON webhooks (status);

CREATE TRIGGER trg_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- WEBHOOK DELIVERIES
-- ============================================================================
CREATE TABLE webhook_deliveries (
    rid          TEXT PRIMARY KEY,
    webhook_rid  TEXT NOT NULL REFERENCES webhooks(rid) ON DELETE CASCADE,
    event        TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED')),
    status_code  INTEGER,
    attempts     INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_rid);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries (status);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries (created_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================
CREATE TABLE functions (
    rid          TEXT PRIMARY KEY,
    api_name     TEXT UNIQUE NOT NULL,
    display_name TEXT,
    description  TEXT,
    version      INTEGER NOT NULL DEFAULT 1,
    runtime      TEXT,
    code         TEXT,
    parameters   JSONB NOT NULL DEFAULT '{}',
    return_type  TEXT,
    status       TEXT NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_functions_status ON functions (status);

CREATE TRIGGER trg_functions_updated_at
    BEFORE UPDATE ON functions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- MEDIA METADATA
-- ============================================================================
CREATE TABLE media_metadata (
    rid          TEXT PRIMARY KEY,
    filename     TEXT NOT NULL,
    content_type TEXT,
    size         BIGINT,
    metadata     JSONB DEFAULT '{}',
    uploaded_by  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_metadata_uploaded_by ON media_metadata (uploaded_by);
CREATE INDEX idx_media_metadata_content_type ON media_metadata (content_type);

-- ============================================================================
-- ROLES
-- ============================================================================
CREATE TABLE roles (
    rid          TEXT PRIMARY KEY,
    name         TEXT UNIQUE NOT NULL,
    permissions  TEXT[] DEFAULT '{}',
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROLE ASSIGNMENTS
-- ============================================================================
CREATE TABLE role_assignments (
    subject_rid  TEXT NOT NULL,
    role_rid     TEXT NOT NULL REFERENCES roles(rid) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (subject_rid, role_rid)
);

CREATE INDEX idx_role_assignments_role ON role_assignments (role_rid);

-- ============================================================================
-- PERMISSION GRANTS
-- ============================================================================
CREATE TABLE permission_grants (
    subject_rid   TEXT NOT NULL,
    resource_rid  TEXT NOT NULL,
    permission    TEXT NOT NULL,
    granted_by    TEXT,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (subject_rid, resource_rid, permission)
);

CREATE INDEX idx_permission_grants_resource ON permission_grants (resource_rid);
CREATE INDEX idx_permission_grants_subject ON permission_grants (subject_rid);

-- ============================================================================
-- SEED DEFAULT ROLES
-- ============================================================================
INSERT INTO roles (rid, name, permissions, description) VALUES
    ('ri.role.platform-admin', 'platform-admin',
     ARRAY['read', 'write', 'execute', 'admin', 'manage-users', 'manage-roles', 'manage-ontologies', 'manage-datasets', 'manage-functions', 'manage-webhooks', 'manage-sentinel'],
     'Full platform administrator with all permissions'),
    ('ri.role.developer', 'developer',
     ARRAY['read', 'write', 'execute'],
     'Developer role with read, write, and execute permissions'),
    ('ri.role.analyst', 'analyst',
     ARRAY['read'],
     'Analyst role with read-only permissions'),
    ('ri.role.viewer', 'viewer',
     ARRAY['read'],
     'Viewer role with read-only permissions')
ON CONFLICT (name) DO NOTHING;

COMMIT;
