-- ============================================================================
-- OpenFoundry: record when a dataset file was last written
-- 010_dataset_file_updated_at.sql
--
-- Foundry's `File` model requires `updatedTime` in both v1 and v2, but
-- `dataset_files` recorded only `created_at`, which does not move when a path
-- is re-uploaded.  `PgFileStore.putFile` has always written
-- `updated_at = NOW()` in its ON CONFLICT clause against a column no migration
-- created, so every overwrite of an existing path failed with
-- `42703 undefined_column`.  This adds the column that clause has always
-- assumed.
--
-- Backfill: existing rows are set to their own `created_at`.  That is not a
-- guess.  Because the overwrite path above could never succeed, no persisted
-- row has ever been rewritten, so for every pre-existing row the insert *is*
-- the only successful write and `created_at` is exactly its write time.
-- ============================================================================

ALTER TABLE dataset_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE dataset_files SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE dataset_files ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE dataset_files ALTER COLUMN updated_at SET NOT NULL;
