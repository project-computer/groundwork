-- 003: weight is a measurement history; attachments are metadata only
-- (bytes live on the filesystem, never in a row).
CREATE TABLE pet_weights (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    weight_grams INTEGER NOT NULL CHECK (weight_grams > 0),
    measured_at TEXT NOT NULL,
    recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_pet_weights_pet ON pet_weights(clinic_id, pet_id, measured_at);

CREATE TABLE pet_attachments (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'photo',
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    checksum TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_pet_attachments_pet ON pet_attachments(clinic_id, pet_id);
