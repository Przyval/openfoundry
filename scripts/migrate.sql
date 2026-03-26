-- ============================================================================
-- OpenFoundry: Consolidated schema for Docker entrypoint init
--
-- This file is mounted into the postgres container as
--   /docker-entrypoint-initdb.d/01-schema.sql
-- and is executed automatically when the database is first created.
--
-- It is a self-contained superset of the incremental migrations in
-- db/migrations/ and can be used to bootstrap a fresh database in one shot.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ----------------------------------------------------------------------------
-- Helper: auto-update updated_at on row modification
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ORGANIZATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    rid          TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description  TEXT,
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    rid           TEXT PRIMARY KEY,
    username      CITEXT UNIQUE NOT NULL,
    email         CITEXT,
    password_hash TEXT,
    org_rid       TEXT REFERENCES organizations(rid) ON DELETE SET NULL,
    display_name  TEXT,
    avatar_url    TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    metadata      JSONB DEFAULT '{}',
    data          JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org_rid ON users (org_rid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- GROUPS
-- ============================================================================
CREATE TABLE IF NOT EXISTS groups (
    rid         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    org_rid     TEXT REFERENCES organizations(rid) ON DELETE CASCADE,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_rid, name)
);

CREATE INDEX IF NOT EXISTS idx_groups_org_rid ON groups (org_rid);

DROP TRIGGER IF EXISTS trg_groups_updated_at ON groups;
CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS group_members (
    group_rid  TEXT NOT NULL REFERENCES groups(rid) ON DELETE CASCADE,
    user_rid   TEXT NOT NULL REFERENCES users(rid) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_rid, user_rid)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members (user_rid);

-- ============================================================================
-- ONTOLOGIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS ontologies (
    rid          TEXT PRIMARY KEY,
    api_name     TEXT UNIQUE NOT NULL,
    display_name TEXT,
    description  TEXT,
    data         JSONB NOT NULL DEFAULT '{}',
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_ontologies_updated_at ON ontologies;
CREATE TRIGGER trg_ontologies_updated_at
    BEFORE UPDATE ON ontologies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- OBJECT TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS object_types (
    rid                     TEXT PRIMARY KEY,
    ontology_rid            TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name                TEXT NOT NULL,
    display_name            TEXT,
    description             TEXT,
    primary_key_api_name    TEXT NOT NULL,
    primary_key_type        TEXT NOT NULL,
    title_property_api_name TEXT,
    properties              JSONB NOT NULL DEFAULT '{}',
    implements              TEXT[] DEFAULT '{}',
    status                  TEXT NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'DEPRECATED', 'EXPERIMENTAL')),
    data                    JSONB NOT NULL DEFAULT '{}',
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_object_types_ontology ON object_types (ontology_rid);
CREATE INDEX IF NOT EXISTS idx_object_types_status ON object_types (status);

DROP TRIGGER IF EXISTS trg_object_types_updated_at ON object_types;
CREATE TRIGGER trg_object_types_updated_at
    BEFORE UPDATE ON object_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ACTION TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS action_types (
    rid               TEXT PRIMARY KEY,
    ontology_rid      TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name          TEXT NOT NULL,
    description       TEXT,
    parameters        JSONB NOT NULL DEFAULT '{}',
    modified_entities JSONB DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'DEPRECATED', 'EXPERIMENTAL')),
    data              JSONB NOT NULL DEFAULT '{}',
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_action_types_ontology ON action_types (ontology_rid);

DROP TRIGGER IF EXISTS trg_action_types_updated_at ON action_types;
CREATE TRIGGER trg_action_types_updated_at
    BEFORE UPDATE ON action_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- LINK TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS link_types (
    rid                         TEXT PRIMARY KEY,
    ontology_rid                TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name                    TEXT NOT NULL,
    object_type_api_name        TEXT NOT NULL,
    linked_object_type_api_name TEXT NOT NULL,
    cardinality                 TEXT NOT NULL DEFAULT 'MANY'
                                CHECK (cardinality IN ('ONE', 'MANY')),
    foreign_key_property        TEXT,
    description                 TEXT,
    data                        JSONB NOT NULL DEFAULT '{}',
    metadata                    JSONB DEFAULT '{}',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_link_types_ontology ON link_types (ontology_rid);
CREATE INDEX IF NOT EXISTS idx_link_types_object ON link_types (object_type_api_name);
CREATE INDEX IF NOT EXISTS idx_link_types_linked ON link_types (linked_object_type_api_name);

DROP TRIGGER IF EXISTS trg_link_types_updated_at ON link_types;
CREATE TRIGGER trg_link_types_updated_at
    BEFORE UPDATE ON link_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- INTERFACE TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS interface_types (
    rid                TEXT PRIMARY KEY,
    ontology_rid       TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name           TEXT NOT NULL,
    description        TEXT,
    properties         JSONB DEFAULT '{}',
    extends_interfaces TEXT[] DEFAULT '{}',
    metadata           JSONB DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_interface_types_ontology ON interface_types (ontology_rid);

DROP TRIGGER IF EXISTS trg_interface_types_updated_at ON interface_types;
CREATE TRIGGER trg_interface_types_updated_at
    BEFORE UPDATE ON interface_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- QUERY TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS query_types (
    rid          TEXT PRIMARY KEY,
    ontology_rid TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name     TEXT NOT NULL,
    version      TEXT,
    description  TEXT,
    parameters   JSONB DEFAULT '{}',
    output       JSONB DEFAULT '{}',
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_query_types_ontology ON query_types (ontology_rid);

DROP TRIGGER IF EXISTS trg_query_types_updated_at ON query_types;
CREATE TRIGGER trg_query_types_updated_at
    BEFORE UPDATE ON query_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SHARED PROPERTY TYPES
-- ============================================================================
CREATE TABLE IF NOT EXISTS shared_property_types (
    rid          TEXT PRIMARY KEY,
    ontology_rid TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name     TEXT NOT NULL,
    display_name TEXT,
    data_type    TEXT NOT NULL,
    description  TEXT,
    validation   JSONB DEFAULT '{}',
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX IF NOT EXISTS idx_shared_property_types_ontology ON shared_property_types (ontology_rid);

-- ============================================================================
-- OBJECTS (actual data rows)
-- ============================================================================
CREATE TABLE IF NOT EXISTS objects (
    rid             TEXT PRIMARY KEY,
    object_type_rid TEXT NOT NULL REFERENCES object_types(rid) ON DELETE RESTRICT,
    ontology_rid    TEXT,
    object_type     TEXT,
    primary_key     TEXT NOT NULL,
    properties      JSONB NOT NULL DEFAULT '{}',
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_type_rid, primary_key)
);

CREATE INDEX IF NOT EXISTS idx_objects_type ON objects (object_type_rid);
CREATE INDEX IF NOT EXISTS idx_objects_type_name ON objects (ontology_rid, object_type);
CREATE INDEX IF NOT EXISTS idx_objects_pk ON objects (ontology_rid, object_type, primary_key);
CREATE INDEX IF NOT EXISTS idx_objects_created ON objects (created_at);
CREATE INDEX IF NOT EXISTS idx_objects_updated ON objects (updated_at);

DROP TRIGGER IF EXISTS trg_objects_updated_at ON objects;
CREATE TRIGGER trg_objects_updated_at
    BEFORE UPDATE ON objects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- OBJECT LINKS (edges between objects)
-- ============================================================================
CREATE TABLE IF NOT EXISTS object_links (
    link_type_rid TEXT NOT NULL REFERENCES link_types(rid) ON DELETE CASCADE,
    source_rid    TEXT NOT NULL REFERENCES objects(rid) ON DELETE CASCADE,
    target_rid    TEXT NOT NULL REFERENCES objects(rid) ON DELETE CASCADE,
    order_index   INTEGER DEFAULT 0,
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (link_type_rid, source_rid, target_rid)
);

CREATE INDEX IF NOT EXISTS idx_object_links_source ON object_links (source_rid);
CREATE INDEX IF NOT EXISTS idx_object_links_target ON object_links (target_rid);

-- ============================================================================
-- LINKS (lightweight link table for in-memory store parity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS links (
    id          SERIAL PRIMARY KEY,
    ontology_rid TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_key  TEXT NOT NULL,
    link_type   TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_key  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ontology_rid, source_type, source_key, link_type, target_type, target_key)
);

CREATE INDEX IF NOT EXISTS idx_links_source ON links (ontology_rid, source_type, source_key);

-- ============================================================================
-- DATASETS
-- ============================================================================
CREATE TABLE IF NOT EXISTS datasets (
    rid              TEXT PRIMARY KEY,
    name             TEXT,
    path             TEXT,
    parent_folder_rid TEXT,
    description      TEXT,
    schema           JSONB DEFAULT '{}',
    data             JSONB NOT NULL DEFAULT '{}',
    metadata         JSONB DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasets_path ON datasets (path);

DROP TRIGGER IF EXISTS trg_datasets_updated_at ON datasets;
CREATE TRIGGER trg_datasets_updated_at
    BEFORE UPDATE ON datasets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- DATASET BRANCHES
-- ============================================================================
CREATE TABLE IF NOT EXISTS dataset_branches (
    rid         TEXT PRIMARY KEY,
    dataset_rid TEXT NOT NULL REFERENCES datasets(rid) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dataset_rid, name)
);

CREATE INDEX IF NOT EXISTS idx_dataset_branches_dataset ON dataset_branches (dataset_rid);

-- ============================================================================
-- DATASET TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS dataset_transactions (
    rid         TEXT PRIMARY KEY,
    dataset_rid TEXT NOT NULL REFERENCES datasets(rid) ON DELETE CASCADE,
    branch_rid  TEXT NOT NULL REFERENCES dataset_branches(rid) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN', 'COMMITTED', 'ABORTED')),
    type        TEXT NOT NULL
                CHECK (type IN ('UPDATE', 'APPEND', 'SNAPSHOT')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dataset_transactions_dataset ON dataset_transactions (dataset_rid);
CREATE INDEX IF NOT EXISTS idx_dataset_transactions_branch ON dataset_transactions (branch_rid);
CREATE INDEX IF NOT EXISTS idx_dataset_transactions_status ON dataset_transactions (status);

DROP TRIGGER IF EXISTS trg_dataset_transactions_updated_at ON dataset_transactions;
CREATE TRIGGER trg_dataset_transactions_updated_at
    BEFORE UPDATE ON dataset_transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- DATASET FILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS dataset_files (
    dataset_rid     TEXT NOT NULL REFERENCES datasets(rid) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    size            BIGINT,
    content_type    TEXT,
    transaction_rid TEXT REFERENCES dataset_transactions(rid) ON DELETE SET NULL,
    s3_key          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (dataset_rid, path)
);

CREATE INDEX IF NOT EXISTS idx_dataset_files_transaction ON dataset_files (transaction_rid);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id            BIGSERIAL PRIMARY KEY,
    timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_rid      TEXT,
    action        TEXT NOT NULL,
    resource_rid  TEXT,
    resource_type TEXT,
    details       JSONB,
    ip_address    INET,
    user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_rid) WHERE user_rid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource_rid) WHERE resource_rid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

-- ============================================================================
-- OAUTH CLIENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id          TEXT PRIMARY KEY,
    client_secret_hash TEXT,
    display_name       TEXT,
    redirect_uris      TEXT[] DEFAULT '{}',
    grant_types        TEXT[] DEFAULT '{}',
    scopes             TEXT[] DEFAULT '{}',
    is_confidential    BOOLEAN NOT NULL DEFAULT TRUE,
    metadata           JSONB DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_oauth_clients_updated_at ON oauth_clients;
CREATE TRIGGER trg_oauth_clients_updated_at
    BEFORE UPDATE ON oauth_clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- OAUTH SESSIONS / TOKENS
-- ============================================================================
CREATE TABLE IF NOT EXISTS oauth_sessions (
    id                 TEXT PRIMARY KEY,
    user_rid           TEXT NOT NULL REFERENCES users(rid) ON DELETE CASCADE,
    client_id          TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    scopes             TEXT[] DEFAULT '{}',
    refresh_token_hash TEXT,
    access_token_hash  TEXT,
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_user ON oauth_sessions (user_rid);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_client ON oauth_sessions (client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires ON oauth_sessions (expires_at)
    WHERE revoked_at IS NULL;

-- ============================================================================
-- ROLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
    rid         TEXT PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    permissions TEXT[] DEFAULT '{}',
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_assignments (
    subject_rid TEXT NOT NULL,
    role_rid    TEXT NOT NULL REFERENCES roles(rid) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (subject_rid, role_rid)
);

CREATE INDEX IF NOT EXISTS idx_role_assignments_role ON role_assignments (role_rid);

-- ============================================================================
-- PERMISSION GRANTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS permission_grants (
    subject_rid  TEXT NOT NULL,
    resource_rid TEXT NOT NULL,
    permission   TEXT NOT NULL,
    granted_by   TEXT,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (subject_rid, resource_rid, permission)
);

CREATE INDEX IF NOT EXISTS idx_permission_grants_resource ON permission_grants (resource_rid);
CREATE INDEX IF NOT EXISTS idx_permission_grants_subject ON permission_grants (subject_rid);

-- ============================================================================
-- SENTINEL MONITORS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sentinel_monitors (
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

CREATE INDEX IF NOT EXISTS idx_sentinel_monitors_status ON sentinel_monitors (status);
CREATE INDEX IF NOT EXISTS idx_sentinel_monitors_object_type ON sentinel_monitors (object_type);

DROP TRIGGER IF EXISTS trg_sentinel_monitors_updated_at ON sentinel_monitors;
CREATE TRIGGER trg_sentinel_monitors_updated_at
    BEFORE UPDATE ON sentinel_monitors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SENTINEL EXECUTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sentinel_executions (
    rid            TEXT PRIMARY KEY,
    monitor_rid    TEXT NOT NULL REFERENCES sentinel_monitors(rid) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'RUNNING'
                   CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILURE')),
    trigger_data   JSONB,
    effect_results JSONB,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at   TIMESTAMPTZ,
    error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_sentinel_executions_monitor ON sentinel_executions (monitor_rid);
CREATE INDEX IF NOT EXISTS idx_sentinel_executions_status ON sentinel_executions (status);
CREATE INDEX IF NOT EXISTS idx_sentinel_executions_started ON sentinel_executions (started_at);

-- ============================================================================
-- WEBHOOKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhooks (
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

CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks (status);

DROP TRIGGER IF EXISTS trg_webhooks_updated_at ON webhooks;
CREATE TRIGGER trg_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- WEBHOOK DELIVERIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
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

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_rid);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries (status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries (created_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS functions (
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

CREATE INDEX IF NOT EXISTS idx_functions_status ON functions (status);

DROP TRIGGER IF EXISTS trg_functions_updated_at ON functions;
CREATE TRIGGER trg_functions_updated_at
    BEFORE UPDATE ON functions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- MEDIA METADATA
-- ============================================================================
CREATE TABLE IF NOT EXISTS media_metadata (
    rid          TEXT PRIMARY KEY,
    filename     TEXT NOT NULL,
    content_type TEXT,
    size         BIGINT,
    metadata     JSONB DEFAULT '{}',
    uploaded_by  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_metadata_uploaded_by ON media_metadata (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_metadata_content_type ON media_metadata (content_type);

-- ============================================================================
-- COMPASS RESOURCES
-- ============================================================================
CREATE TABLE IF NOT EXISTS compass_resources (
    rid         TEXT PRIMARY KEY,
    type        TEXT NOT NULL
                CHECK (type IN ('FOLDER', 'PROJECT', 'DATASET', 'ONTOLOGY', 'FILE')),
    name        TEXT NOT NULL,
    path        TEXT NOT NULL,
    parent_rid  TEXT REFERENCES compass_resources(rid) ON DELETE CASCADE,
    description TEXT,
    created_by  TEXT,
    markings    TEXT[] DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (parent_rid, name)
);

CREATE INDEX IF NOT EXISTS idx_compass_resources_type ON compass_resources (type);
CREATE INDEX IF NOT EXISTS idx_compass_resources_parent ON compass_resources (parent_rid);
CREATE INDEX IF NOT EXISTS idx_compass_resources_path ON compass_resources (path);
CREATE INDEX IF NOT EXISTS idx_compass_resources_created_by ON compass_resources (created_by);

DROP TRIGGER IF EXISTS trg_compass_resources_updated_at ON compass_resources;
CREATE TRIGGER trg_compass_resources_updated_at
    BEFORE UPDATE ON compass_resources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- COMPASS LINEAGE EDGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS compass_lineage_edges (
    rid        TEXT PRIMARY KEY,
    source_rid TEXT NOT NULL,
    target_rid TEXT NOT NULL,
    edge_type  TEXT NOT NULL
               CHECK (edge_type IN ('DERIVED_FROM', 'PRODUCES', 'CONSUMES', 'TRANSFORMS', 'COPIES', 'JOINS')),
    metadata   JSONB DEFAULT '{}',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_edges_source ON compass_lineage_edges (source_rid);
CREATE INDEX IF NOT EXISTS idx_lineage_edges_target ON compass_lineage_edges (target_rid);
CREATE INDEX IF NOT EXISTS idx_lineage_edges_type ON compass_lineage_edges (edge_type);

-- ============================================================================
-- ACTION REGISTRATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS action_registrations (
    rid               TEXT PRIMARY KEY,
    api_name          TEXT UNIQUE NOT NULL,
    display_name      TEXT,
    parameters        JSONB NOT NULL DEFAULT '{}',
    modified_entities JSONB DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'EXPERIMENTAL', 'DEPRECATED')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_registrations_status ON action_registrations (status);

DROP TRIGGER IF EXISTS trg_action_registrations_updated_at ON action_registrations;
CREATE TRIGGER trg_action_registrations_updated_at
    BEFORE UPDATE ON action_registrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ACTION EXECUTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS action_executions (
    rid             TEXT PRIMARY KEY,
    action_api_name TEXT NOT NULL,
    parameters      JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'RUNNING'
                    CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    result          JSONB,
    error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_action_executions_api_name ON action_executions (action_api_name);
CREATE INDEX IF NOT EXISTS idx_action_executions_status ON action_executions (status);
CREATE INDEX IF NOT EXISTS idx_action_executions_started ON action_executions (started_at);

-- ============================================================================
-- SENTINEL NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sentinel_notifications (
    rid          TEXT PRIMARY KEY,
    monitor_rid  TEXT NOT NULL REFERENCES sentinel_monitors(rid) ON DELETE CASCADE,
    message      TEXT NOT NULL,
    severity     TEXT NOT NULL DEFAULT 'INFO'
                 CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_notifications_monitor ON sentinel_notifications (monitor_rid);
CREATE INDEX IF NOT EXISTS idx_sentinel_notifications_severity ON sentinel_notifications (severity);
CREATE INDEX IF NOT EXISTS idx_sentinel_notifications_unack ON sentinel_notifications (acknowledged)
    WHERE acknowledged = FALSE;

-- ============================================================================
-- MIGRATIONS TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mark all incremental migrations as applied so the migration runner
-- does not attempt to re-run them against this already-complete schema.
INSERT INTO _migrations (name) VALUES
    ('001_initial.sql'),
    ('002_search_indexes.sql'),
    ('003_phase1_tables.sql'),
    ('004_ontology_interfaces.sql'),
    ('005_phase2_aip.sql'),
    ('006_phase2_pipelines.sql'),
    ('007_phase2_search.sql'),
    ('008_sentinel_notifications.sql')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SEED DEFAULT ROLES
-- ============================================================================
INSERT INTO roles (rid, name, permissions, description) VALUES
    ('ri.role.platform-admin', 'platform-admin',
     ARRAY['read','write','execute','admin','manage-users','manage-roles','manage-ontologies','manage-datasets','manage-functions','manage-webhooks','manage-sentinel'],
     'Full platform administrator with all permissions'),
    ('ri.role.developer', 'developer',
     ARRAY['read','write','execute'],
     'Developer role with read, write, and execute permissions'),
    ('ri.role.analyst', 'analyst',
     ARRAY['read'],
     'Analyst role with read-only permissions'),
    ('ri.role.viewer', 'viewer',
     ARRAY['read'],
     'Viewer role with read-only permissions')
ON CONFLICT (name) DO NOTHING;

COMMIT;
