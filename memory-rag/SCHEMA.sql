-- Persistent RAG memory schema for WickedOps / Sable.
-- Prepared migration; intentionally not applied by this commit.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sable_memory_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_key text NOT NULL,
    project_key text,
    memory_type text NOT NULL,
    content text NOT NULL,
    source_type text NOT NULL,
    source_ref text,
    source_event_id text,
    importance real NOT NULL DEFAULT 0.5,
    confidence real NOT NULL DEFAULT 1.0,
    status text NOT NULL DEFAULT 'active',
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_to timestamptz,
    supersedes_id uuid REFERENCES sable_memory_items(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    embedding vector(1536)
);

CREATE INDEX IF NOT EXISTS sable_memory_items_user_project_idx
    ON sable_memory_items (user_key, project_key, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sable_memory_items_type_idx
    ON sable_memory_items (user_key, memory_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS sable_memory_items_embedding_idx
    ON sable_memory_items
    USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS sable_command_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_key text NOT NULL,
    project_key text,
    conversation_ref text,
    instruction_text text NOT NULL,
    normalized_intent text,
    requested_action text,
    execution_target text,
    exact_command text,
    status text NOT NULL DEFAULT 'requested',
    result_summary text,
    result_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_text text,
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    verified_at timestamptz,
    supersedes_id uuid REFERENCES sable_command_ledger(id)
);

CREATE INDEX IF NOT EXISTS sable_command_ledger_lookup_idx
    ON sable_command_ledger (user_key, project_key, requested_at DESC);

CREATE INDEX IF NOT EXISTS sable_command_ledger_status_idx
    ON sable_command_ledger (user_key, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS sable_state_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_key text NOT NULL,
    project_key text,
    entity_type text NOT NULL,
    entity_key text NOT NULL,
    state text NOT NULL,
    value jsonb NOT NULL,
    source_type text NOT NULL,
    source_ref text,
    observed_at timestamptz NOT NULL DEFAULT now(),
    supersedes_id uuid REFERENCES sable_state_snapshots(id)
);

CREATE INDEX IF NOT EXISTS sable_state_snapshots_lookup_idx
    ON sable_state_snapshots (user_key, project_key, entity_type, entity_key, observed_at DESC);

CREATE TABLE IF NOT EXISTS sable_memory_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id uuid NOT NULL REFERENCES sable_memory_items(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    token_count integer,
    embedding vector(1536),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(memory_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS sable_memory_chunks_embedding_idx
    ON sable_memory_chunks
    USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS sable_memory_retrieval_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_key text NOT NULL,
    project_key text,
    query_text text NOT NULL,
    filters jsonb NOT NULL DEFAULT '{}'::jsonb,
    retrieved_ids uuid[] NOT NULL DEFAULT '{}',
    retrieval_mode text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
