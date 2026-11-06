-- 010: per-clinic application settings (key/value).
CREATE TABLE application_settings (
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (clinic_id, key)
);
