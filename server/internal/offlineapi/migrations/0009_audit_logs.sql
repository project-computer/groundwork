-- 009: append-only audit log.
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_logs_clinic_date ON audit_logs(clinic_id, created_at);
CREATE INDEX idx_audit_logs_entity ON audit_logs(clinic_id, entity_type, entity_id);
