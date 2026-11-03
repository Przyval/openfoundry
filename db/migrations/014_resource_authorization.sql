-- ============================================================================
-- OpenFoundry: Foundry-style authorization
-- 014_resource_authorization.sql
--
-- Replaces the global `roles` / `role_assignments` tables and the
-- `permission_grants` ACL with what Foundry documents: a role (owner, editor,
-- viewer or discoverer) held by a user or group ON A RESOURCE and inherited by
-- its contents, plus the mandatory Organization and Marking restrictions on a
-- resource. Roles themselves are platform-defined, so there is no roles table.
--
-- scripts/migrate.sql declares the same tables for the Compose database.
-- ============================================================================

DROP TABLE IF EXISTS permission_grants;
DROP TABLE IF EXISTS role_assignments;
DROP TABLE IF EXISTS roles;

CREATE TABLE IF NOT EXISTS resource_role_grants (
    resource_rid   TEXT NOT NULL,
    principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
    principal_id   TEXT NOT NULL,
    role_id        TEXT NOT NULL CHECK (role_id IN ('owner', 'editor', 'viewer', 'discoverer')),
    granted_by     TEXT,
    granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (resource_rid, principal_type, principal_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_role_grants_principal
    ON resource_role_grants (principal_type, principal_id);

CREATE TABLE IF NOT EXISTS resource_policies (
    resource_rid  TEXT PRIMARY KEY,
    organizations TEXT[] NOT NULL DEFAULT '{}',
    markings      TEXT[] NOT NULL DEFAULT '{}'
);
