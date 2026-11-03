-- ============================================================================
-- OpenFoundry: the Groups and Markings a sign-in carries
-- 015_user_groups_markings.sql
--
-- The permission model (packages/permissions) checks a resource's Markings
-- against the caller's, and counts a role granted to any of the caller's
-- groups. svc-multipass signs both into the token from these two columns,
-- which an operator sets with services/svc-multipass/src/cli/users.ts.
--
-- It also retires the legacy platform roles EDITOR and VIEWER: each meant
-- access to every resource, which is now that role (editor, viewer) held on
-- the platform root. They are moved there and dropped from platform_roles.
--
-- scripts/migrate.sql does the same for the Compose database.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS group_ids   TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS marking_ids TEXT[] NOT NULL DEFAULT '{}';

DO $$
DECLARE
    moved INTEGER;
BEGIN
    INSERT INTO resource_role_grants (resource_rid, principal_type, principal_id, role_id, granted_by)
    SELECT DISTINCT 'ri.platform.main.root.root', 'user', u.username::text, lower(r.role), 'migration-015'
      FROM users u, unnest(u.platform_roles) AS r(role)
     WHERE upper(r.role) IN ('EDITOR', 'VIEWER')
    ON CONFLICT DO NOTHING;

    UPDATE users
       SET platform_roles = ARRAY(
               SELECT r FROM unnest(platform_roles) AS r WHERE upper(r) NOT IN ('EDITOR', 'VIEWER'))
     WHERE EXISTS (SELECT 1 FROM unnest(platform_roles) AS r WHERE upper(r) IN ('EDITOR', 'VIEWER'));
    GET DIAGNOSTICS moved = ROW_COUNT;

    IF moved > 0 THEN
        RAISE WARNING 'platform roles EDITOR and VIEWER are deprecated: % user(s) now hold them as editor/viewer on the platform root', moved;
    END IF;
END $$;
