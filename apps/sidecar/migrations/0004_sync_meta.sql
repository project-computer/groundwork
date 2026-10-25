-- Sync bookkeeping. The local clinic document already carries an outbox of
-- pending entity changes; this table only stores the pull cursor and device
-- identity so the sidecar can resume after a restart.
CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
