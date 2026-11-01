-- ============================================================================
-- OpenFoundry: record the ontology an embedding belongs to
-- 011_aip_embedding_ontology.sql
--
-- An object type's API name is unique only within one ontology, so semantic
-- search over `/ontologies/{ontologyRid}/objects/semantic-search` must only
-- match embeddings of that ontology.  NULL marks an embedding stored without
-- an ontology; such rows match only searches that name no ontology.
-- ============================================================================

ALTER TABLE aip_embeddings ADD COLUMN IF NOT EXISTS ontology_rid TEXT;

CREATE INDEX IF NOT EXISTS idx_aip_embeddings_ontology ON aip_embeddings (ontology_rid);
