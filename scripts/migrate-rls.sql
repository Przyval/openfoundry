-- =============================================================================
-- Migration: Multi-tenancy via Postgres Row Level Security (RLS)
--
-- Adds org_rid to key tables and enforces tenant isolation at DB level.
-- app.current_org_rid session variable must be set before each query.
-- =============================================================================

-- Add org_rid column to tenant-scoped tables (nullable for backward compat)
ALTER TABLE ontologies    ADD COLUMN IF NOT EXISTS org_rid TEXT REFERENCES organizations(rid) ON DELETE CASCADE;
ALTER TABLE object_types  ADD COLUMN IF NOT EXISTS org_rid TEXT REFERENCES organizations(rid) ON DELETE CASCADE;
ALTER TABLE objects        ADD COLUMN IF NOT EXISTS org_rid TEXT REFERENCES organizations(rid) ON DELETE CASCADE;
ALTER TABLE links          ADD COLUMN IF NOT EXISTS org_rid TEXT REFERENCES organizations(rid) ON DELETE CASCADE;
ALTER TABLE datasets       ADD COLUMN IF NOT EXISTS org_rid TEXT REFERENCES organizations(rid) ON DELETE CASCADE;
ALTER TABLE actions        ADD COLUMN IF NOT EXISTS org_rid TEXT REFERENCES organizations(rid) ON DELETE CASCADE;
ALTER TABLE monitors       ADD COLUMN IF NOT EXISTS org_rid TEXT REFERENCES organizations(rid) ON DELETE CASCADE;

-- Indexes for org_rid filtering
CREATE INDEX IF NOT EXISTS idx_ontologies_org    ON ontologies   (org_rid);
CREATE INDEX IF NOT EXISTS idx_object_types_org  ON object_types (org_rid);
CREATE INDEX IF NOT EXISTS idx_objects_org        ON objects       (org_rid);
CREATE INDEX IF NOT EXISTS idx_links_org          ON links         (org_rid);
CREATE INDEX IF NOT EXISTS idx_datasets_org       ON datasets      (org_rid);

-- Enable RLS on all tenant-scoped tables
ALTER TABLE ontologies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets      ENABLE ROW LEVEL SECURITY;

-- RLS policies: tenant sees only their org's rows, OR rows with no org (shared/public)
CREATE POLICY IF NOT EXISTS rls_ontologies_tenant   ON ontologies
  USING (org_rid IS NULL OR org_rid = current_setting('app.current_org_rid', true));

CREATE POLICY IF NOT EXISTS rls_object_types_tenant ON object_types
  USING (org_rid IS NULL OR org_rid = current_setting('app.current_org_rid', true));

CREATE POLICY IF NOT EXISTS rls_objects_tenant      ON objects
  USING (org_rid IS NULL OR org_rid = current_setting('app.current_org_rid', true));

CREATE POLICY IF NOT EXISTS rls_links_tenant        ON links
  USING (org_rid IS NULL OR org_rid = current_setting('app.current_org_rid', true));

CREATE POLICY IF NOT EXISTS rls_datasets_tenant     ON datasets
  USING (org_rid IS NULL OR org_rid = current_setting('app.current_org_rid', true));

-- Default org for existing data (retroactive — tag as "default" org)
INSERT INTO organizations (rid, display_name, description)
  VALUES ('ri.multipass.main.organization.default', 'Default Organization', 'Default org for existing data')
  ON CONFLICT (rid) DO NOTHING;

-- Tag all untagged rows as belonging to default org
UPDATE ontologies   SET org_rid = 'ri.multipass.main.organization.default' WHERE org_rid IS NULL;
UPDATE object_types SET org_rid = 'ri.multipass.main.organization.default' WHERE org_rid IS NULL;
UPDATE objects       SET org_rid = 'ri.multipass.main.organization.default' WHERE org_rid IS NULL;
UPDATE links         SET org_rid = 'ri.multipass.main.organization.default' WHERE org_rid IS NULL;
UPDATE datasets      SET org_rid = 'ri.multipass.main.organization.default' WHERE org_rid IS NULL;

-- Helper function: set current tenant for a session
CREATE OR REPLACE FUNCTION set_tenant(p_org_rid TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_org_rid', p_org_rid, true);
END;
$$ LANGUAGE plpgsql;
