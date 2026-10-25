-- Cloud sync storage for the desktop ClinicState document model.
-- One row per synced entity per clinic; version is assigned from a global
-- sequence so pull cursors are monotonic across entity types.

CREATE SEQUENCE IF NOT EXISTS sync_version_seq;

CREATE TABLE IF NOT EXISTS sync_entities (
    clinic_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    parent_id TEXT,
    operation TEXT NOT NULL CHECK (operation IN ('upsert', 'append', 'delete')),
    payload JSONB NOT NULL,
    version BIGINT NOT NULL,
    occurred_at TEXT NOT NULL,
    occurred_ts TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_entities_pull
    ON sync_entities (clinic_id, version);
CREATE INDEX IF NOT EXISTS idx_sync_entities_occurred
    ON sync_entities (clinic_id, entity_type, entity_id, occurred_ts);
