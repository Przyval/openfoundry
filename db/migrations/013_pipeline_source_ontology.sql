-- ============================================================================
-- OpenFoundry: record the ontology a pipeline's source object type belongs to
-- 013_pipeline_source_ontology.sql
--
-- An object type's API name is unique only within one ontology, so a pipeline
-- reading objects must name the ontology it reads them from.  NULL marks a
-- pipeline defined before this column existed; its run resolves the single
-- ontology that declares the source object type, and fails if that is not
-- exactly one.
-- ============================================================================

ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS ontology_rid TEXT;
