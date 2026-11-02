-- ============================================================================
-- OpenFoundry: the platform roles a user's sign-in carries
-- 011_user_platform_roles.sql
--
-- svc-multipass authenticates people against `users.password_hash` and signs
-- their platform roles into the token's `roles` claim.  Those roles had no home:
-- the only per-user record of a role was a free-text `metadata.role`, and the
-- `roles` / `role_assignments` tables use a different vocabulary from the one
-- the permission middleware resolves (ADMIN, EDITOR, VIEWER, SERVICE_ACCOUNT in
-- packages/permissions/src/roles.ts).  This gives each user an explicit list in
-- that vocabulary, empty by default, so an account carries no role until an
-- operator grants one (services/svc-multipass/src/cli/users.ts).
--
-- scripts/migrate.sql declares the same column for the Compose database.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_roles TEXT[] NOT NULL DEFAULT '{}';
