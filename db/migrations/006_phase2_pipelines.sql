BEGIN;

CREATE TABLE pipelines (
    rid TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]',
    schedule JSONB,
    input_datasets TEXT[] DEFAULT '{}',
    output_dataset TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ERROR')),
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipelines_status ON pipelines (status);

CREATE TRIGGER trg_pipelines_updated_at
    BEFORE UPDATE ON pipelines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE pipeline_runs (
    rid TEXT PRIMARY KEY,
    pipeline_rid TEXT NOT NULL REFERENCES pipelines(rid) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    step_results JSONB DEFAULT '[]',
    rows_processed INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error TEXT
);

CREATE INDEX idx_pipeline_runs_pipeline ON pipeline_runs (pipeline_rid);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs (status);
CREATE INDEX idx_pipeline_runs_started ON pipeline_runs (started_at);

COMMIT;
