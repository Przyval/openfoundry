-- ============================================================================
-- OpenFoundry: Initial Schema Migration
-- 001_initial.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive text columns

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
CREATE TABLE organizations (
    rid         TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
    rid         TEXT PRIMARY KEY,
    username    CITEXT UNIQUE NOT NULL,
    email       CITEXT,
    password_hash TEXT,
    org_rid     TEXT REFERENCES organizations(rid) ON DELETE SET NULL,
    display_name TEXT,
    avatar_url  TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_org_rid ON users (org_rid);
CREATE INDEX idx_users_email ON users (email) WHERE email IS NOT NULL;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- GROUPS
-- ============================================================================
CREATE TABLE groups (
    rid         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    org_rid     TEXT REFERENCES organizations(rid) ON DELETE CASCADE,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (org_rid, name)
);

CREATE INDEX idx_groups_org_rid ON groups (org_rid);

CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Group membership (many-to-many)
CREATE TABLE group_members (
    group_rid   TEXT NOT NULL REFERENCES groups(rid) ON DELETE CASCADE,
    user_rid    TEXT NOT NULL REFERENCES users(rid) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'MEMBER',  -- MEMBER | ADMIN
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (group_rid, user_rid)
);

CREATE INDEX idx_group_members_user ON group_members (user_rid);

-- ============================================================================
-- ONTOLOGIES
-- ============================================================================
CREATE TABLE ontologies (
    rid          TEXT PRIMARY KEY,
    api_name     TEXT UNIQUE NOT NULL,
    display_name TEXT,
    description  TEXT,
    metadata     JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ontologies_updated_at
    BEFORE UPDATE ON ontologies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- OBJECT TYPES
-- ============================================================================
CREATE TABLE object_types (
    rid                     TEXT PRIMARY KEY,
    ontology_rid            TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name                TEXT NOT NULL,
    display_name            TEXT,
    description             TEXT,
    primary_key_api_name    TEXT NOT NULL,
    primary_key_type        TEXT NOT NULL,           -- STRING | INTEGER | etc.
    title_property_api_name TEXT,
    properties              JSONB NOT NULL DEFAULT '{}',
    implements              TEXT[] DEFAULT '{}',
    status                  TEXT NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'DEPRECATED', 'EXPERIMENTAL')),
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX idx_object_types_ontology ON object_types (ontology_rid);
CREATE INDEX idx_object_types_status ON object_types (status);

CREATE TRIGGER trg_object_types_updated_at
    BEFORE UPDATE ON object_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ACTION TYPES
-- ============================================================================
CREATE TABLE action_types (
    rid               TEXT PRIMARY KEY,
    ontology_rid      TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name          TEXT NOT NULL,
    description       TEXT,
    parameters        JSONB NOT NULL DEFAULT '{}',
    modified_entities JSONB DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'DEPRECATED', 'EXPERIMENTAL')),
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX idx_action_types_ontology ON action_types (ontology_rid);

CREATE TRIGGER trg_action_types_updated_at
    BEFORE UPDATE ON action_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- LINK TYPES
-- ============================================================================
CREATE TABLE link_types (
    rid                         TEXT PRIMARY KEY,
    ontology_rid                TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name                    TEXT NOT NULL,
    object_type_api_name        TEXT NOT NULL,
    linked_object_type_api_name TEXT NOT NULL,
    cardinality                 TEXT NOT NULL DEFAULT 'MANY'
                                CHECK (cardinality IN ('ONE', 'MANY')),
    foreign_key_property        TEXT,
    description                 TEXT,
    metadata                    JSONB DEFAULT '{}',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX idx_link_types_ontology ON link_types (ontology_rid);
CREATE INDEX idx_link_types_object ON link_types (object_type_api_name);
CREATE INDEX idx_link_types_linked ON link_types (linked_object_type_api_name);

CREATE TRIGGER trg_link_types_updated_at
    BEFORE UPDATE ON link_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- INTERFACE TYPES
-- ============================================================================
CREATE TABLE interface_types (
    rid                 TEXT PRIMARY KEY,
    ontology_rid        TEXT NOT NULL REFERENCES ontologies(rid) ON DELETE CASCADE,
    api_name            TEXT NOT NULL,
    description         TEXT,
    properties          JSONB DEFAULT '{}',
    extends_interfaces  TEXT[] DEFAULT '{}',
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (ontology_rid, api_name)
);

CREATE INDEX idx_interface_types_ontology ON interface_types (ontology_rid);

CREATE TRIGGER trg_interface_types_updated_at
    BEFORE UPDATE ON interface_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- QUERY TYPES
-- ============================================================================
CREATE TABLE query_types (
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

CREATE INDEX idx_query_types_ontology ON query_types (ontology_rid);

CREATE TRIGGER trg_query_types_updated_at
    BEFORE UPDATE ON query_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- OBJECTS (actual data rows)
-- ============================================================================
CREATE TABLE objects (
    rid             TEXT PRIMARY KEY,
    object_type_rid TEXT NOT NULL REFERENCES object_types(rid) ON DELETE RESTRICT,
    primary_key     TEXT NOT NULL,
    properties      JSONB NOT NULL DEFAULT '{}',
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (object_type_rid, primary_key)
);

CREATE INDEX idx_objects_type ON objects (object_type_rid);
CREATE INDEX idx_objects_created ON objects (created_at);
CREATE INDEX idx_objects_updated ON objects (updated_at);

CREATE TRIGGER trg_objects_updated_at
    BEFORE UPDATE ON objects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- OBJECT LINKS (edges between objects)
-- ============================================================================
CREATE TABLE object_links (
    link_type_rid   TEXT NOT NULL REFERENCES link_types(rid) ON DELETE CASCADE,
    source_rid      TEXT NOT NULL REFERENCES objects(rid) ON DELETE CASCADE,
    target_rid      TEXT NOT NULL REFERENCES objects(rid) ON DELETE CASCADE,
    order_index     INTEGER DEFAULT 0,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (link_type_rid, source_rid, target_rid)
);

CREATE INDEX idx_object_links_source ON object_links (source_rid);
CREATE INDEX idx_object_links_target ON object_links (target_rid);

-- ============================================================================
-- DATASETS
-- ============================================================================
CREATE TABLE datasets (
    rid         TEXT PRIMARY KEY,
    path        TEXT NOT NULL,
    description TEXT,
    schema      JSONB DEFAULT '{}',
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_datasets_path ON datasets (path);

CREATE TRIGGER trg_datasets_updated_at
    BEFORE UPDATE ON datasets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
CREATE TABLE audit_log (
    id           BIGSERIAL PRIMARY KEY,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_rid     TEXT,
    action       TEXT NOT NULL,
    resource_rid TEXT,
    resource_type TEXT,
    details      JSONB,
    ip_address   INET,
    user_agent   TEXT
);

CREATE INDEX idx_audit_log_timestamp ON audit_log (timestamp);
CREATE INDEX idx_audit_log_user ON audit_log (user_rid) WHERE user_rid IS NOT NULL;
CREATE INDEX idx_audit_log_resource ON audit_log (resource_rid) WHERE resource_rid IS NOT NULL;
CREATE INDEX idx_audit_log_action ON audit_log (action);

-- ============================================================================
-- OAUTH CLIENTS
-- ============================================================================
CREATE TABLE oauth_clients (
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

CREATE TRIGGER trg_oauth_clients_updated_at
    BEFORE UPDATE ON oauth_clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- OAUTH SESSIONS / TOKENS
-- ============================================================================
CREATE TABLE oauth_sessions (
    id                  TEXT PRIMARY KEY,
    user_rid            TEXT NOT NULL REFERENCES users(rid) ON DELETE CASCADE,
    client_id           TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    scopes              TEXT[] DEFAULT '{}',
    refresh_token_hash  TEXT,
    access_token_hash   TEXT,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oauth_sessions_user ON oauth_sessions (user_rid);
CREATE INDEX idx_oauth_sessions_client ON oauth_sessions (client_id);
CREATE INDEX idx_oauth_sessions_expires ON oauth_sessions (expires_at)
    WHERE revoked_at IS NULL;

COMMIT;
