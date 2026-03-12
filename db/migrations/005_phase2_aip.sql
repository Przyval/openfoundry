BEGIN;

-- Conversations for AIP chat
CREATE TABLE aip_conversations (
    rid TEXT PRIMARY KEY,
    title TEXT,
    user_rid TEXT,
    ontology_rid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE aip_messages (
    rid TEXT PRIMARY KEY,
    conversation_rid TEXT NOT NULL REFERENCES aip_conversations(rid) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aip_messages_conversation ON aip_messages (conversation_rid);

-- Vector embeddings using pgvector
CREATE TABLE aip_embeddings (
    rid TEXT PRIMARY KEY,
    source_rid TEXT NOT NULL,
    source_type TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aip_embeddings_source ON aip_embeddings (source_rid);
CREATE INDEX idx_aip_embeddings_vector ON aip_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- AI-generated functions
CREATE TABLE aip_generated_functions (
    rid TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    code TEXT NOT NULL,
    api_name TEXT,
    parameters JSONB DEFAULT '{}',
    return_type TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'DEPLOYED')),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_aip_conversations_updated_at
    BEFORE UPDATE ON aip_conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
