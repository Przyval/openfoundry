-- ============================================================================
-- OpenFoundry: Multi-Tenancy via Row-Level Security (RLS)
-- 009_multi_tenancy.sql
--
-- Adds org_rid to all core tables and enables RLS policies so that each
-- tenant sees only their own data.  Tenant context is set per-transaction
-- via:  SET LOCAL app.org_rid = '<org_rid>';
--
-- Tables that already have org_rid: users, groups (from 001_initial.sql)
-- Tables that need org_rid added: ontologies, object_types, action_types,
--   link_types, interface_types, query_types, objects, object_links,
--   datasets, audit_log, oauth_clients, oauth_sessions,
--   action_registrations, action_executions, dataset_branches,
--   dataset_transactions, dataset_files, compass_resources,
--   compass_lineage_edges, sentinel_monitors, sentinel_executions,
--   webhooks, webhook_deliveries, functions, media_metadata,
--   aip_conversations, aip_messages, aip_embeddings,
--   aip_generated_functions, pipelines, pipeline_runs,
--   search_index, sentinel_notifications
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Step 1: Create a default organization for existing data
-- ----------------------------------------------------------------------------
INSERT INTO organizations (rid, display_name, description)
VALUES ('org:default', 'Default Organization', 'Auto-created for pre-existing data')
ON CONFLICT (rid) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Step 2: Add org_rid columns to tables that lack them
-- Default to 'org:default' so existing rows are not orphaned.
-- ----------------------------------------------------------------------------

-- Core ontology tables
ALTER TABLE ontologies ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE object_types ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE action_types ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE link_types ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE interface_types ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE query_types ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE objects ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE object_links ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- Datasets & files
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- Auth & audit
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE oauth_clients ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE oauth_sessions ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- Phase 1 tables (003)
ALTER TABLE action_registrations ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE action_executions ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE dataset_branches ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE dataset_transactions ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE dataset_files ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE compass_resources ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE compass_lineage_edges ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE sentinel_monitors ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE sentinel_executions ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE functions ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE media_metadata ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE permission_grants ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- Phase 2 AIP tables (005)
ALTER TABLE aip_conversations ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE aip_messages ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE aip_embeddings ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE aip_generated_functions ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- Phase 2 Pipelines (006)
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- Phase 2 Search (007)
ALTER TABLE search_index ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- Sentinel notifications (008)
ALTER TABLE sentinel_notifications ADD COLUMN IF NOT EXISTS org_rid TEXT NOT NULL DEFAULT 'org:default' REFERENCES organizations(rid);

-- ----------------------------------------------------------------------------
-- Step 3: Create indexes on org_rid for efficient RLS filtering
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ontologies_org ON ontologies(org_rid);
CREATE INDEX IF NOT EXISTS idx_object_types_org ON object_types(org_rid);
CREATE INDEX IF NOT EXISTS idx_action_types_org ON action_types(org_rid);
CREATE INDEX IF NOT EXISTS idx_link_types_org ON link_types(org_rid);
CREATE INDEX IF NOT EXISTS idx_objects_org ON objects(org_rid);
CREATE INDEX IF NOT EXISTS idx_datasets_org ON datasets(org_rid);
CREATE INDEX IF NOT EXISTS idx_functions_org ON functions(org_rid);
CREATE INDEX IF NOT EXISTS idx_aip_conversations_org ON aip_conversations(org_rid);
CREATE INDEX IF NOT EXISTS idx_pipelines_org ON pipelines(org_rid);
CREATE INDEX IF NOT EXISTS idx_compass_resources_org ON compass_resources(org_rid);
CREATE INDEX IF NOT EXISTS idx_sentinel_monitors_org ON sentinel_monitors(org_rid);
CREATE INDEX IF NOT EXISTS idx_action_registrations_org ON action_registrations(org_rid);

-- ----------------------------------------------------------------------------
-- Step 4: Create application role for RLS (services connect as this role)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openfoundry_app') THEN
    CREATE ROLE openfoundry_app LOGIN;
  END IF;
END $$;

-- Grant necessary permissions to the app role
GRANT USAGE ON SCHEMA public TO openfoundry_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO openfoundry_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO openfoundry_app;

-- ----------------------------------------------------------------------------
-- Step 5: Enable RLS and create tenant isolation policies
--
-- Policy: rows are visible only when org_rid matches the session variable
-- app.org_rid.  The superuser (migration runner) bypasses RLS.
-- ----------------------------------------------------------------------------

-- Helper: create RLS policy for a table
-- Pattern: ENABLE RLS → CREATE POLICY → FORCE for app role

-- Core tables
ALTER TABLE ontologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ontologies
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE ontologies FORCE ROW LEVEL SECURITY;

ALTER TABLE object_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON object_types
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE object_types FORCE ROW LEVEL SECURITY;

ALTER TABLE action_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON action_types
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE action_types FORCE ROW LEVEL SECURITY;

ALTER TABLE link_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON link_types
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE link_types FORCE ROW LEVEL SECURITY;

ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON objects
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE objects FORCE ROW LEVEL SECURITY;

ALTER TABLE object_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON object_links
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE object_links FORCE ROW LEVEL SECURITY;

ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON datasets
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE datasets FORCE ROW LEVEL SECURITY;

ALTER TABLE functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON functions
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE functions FORCE ROW LEVEL SECURITY;

ALTER TABLE aip_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON aip_conversations
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE aip_conversations FORCE ROW LEVEL SECURITY;

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pipelines
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE pipelines FORCE ROW LEVEL SECURITY;

ALTER TABLE compass_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON compass_resources
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE compass_resources FORCE ROW LEVEL SECURITY;

ALTER TABLE sentinel_monitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sentinel_monitors
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE sentinel_monitors FORCE ROW LEVEL SECURITY;

ALTER TABLE action_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON action_registrations
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE action_registrations FORCE ROW LEVEL SECURITY;

-- User-scoped tables (already have org_rid from 001)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
  USING (org_rid = current_setting('app.org_rid', true) OR org_rid IS NULL)
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE users FORCE ROW LEVEL SECURITY;

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON groups
  USING (org_rid = current_setting('app.org_rid', true) OR org_rid IS NULL)
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE groups FORCE ROW LEVEL SECURITY;

-- Audit log: read-only isolation (tenants can see their own audit entries)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log
  USING (org_rid = current_setting('app.org_rid', true))
  WITH CHECK (org_rid = current_setting('app.org_rid', true));
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

COMMIT;
