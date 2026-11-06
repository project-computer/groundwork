-- 004: appointments.
CREATE TABLE appointments (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    veterinarian_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    scheduled_at TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'
    )),
    cancellation_reason TEXT NOT NULL DEFAULT '',
    checked_in_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_appointments_date ON appointments(clinic_id, scheduled_at);
CREATE INDEX idx_appointments_pet ON appointments(clinic_id, pet_id);
CREATE INDEX idx_appointments_status ON appointments(clinic_id, status);
