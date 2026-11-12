-- 005: consultations, diagnoses, treatments.
CREATE TABLE consultations (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
    veterinarian_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    chief_complaint TEXT NOT NULL DEFAULT '',
    symptoms TEXT NOT NULL DEFAULT '',
    examination TEXT NOT NULL DEFAULT '',
    diagnosis_notes TEXT NOT NULL DEFAULT '',
    treatment_plan TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams > 0),
    temperature_celsius REAL,
    heart_rate_bpm INTEGER,
    respiratory_rate_bpm INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_consultations_pet ON consultations(clinic_id, pet_id, created_at);
CREATE INDEX idx_consultations_appointment ON consultations(appointment_id);

CREATE TABLE diagnoses (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    code TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_diagnoses_consultation ON diagnoses(consultation_id);

CREATE TABLE treatments (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_treatments_consultation ON treatments(consultation_id);
