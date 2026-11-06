-- 006: medication catalog, prescriptions, prescription items.
CREATE TABLE medications (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    strength TEXT NOT NULL DEFAULT '',
    form TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_medications_clinic_name ON medications(clinic_id, name);

CREATE TABLE prescriptions (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    consultation_id TEXT NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    veterinarian_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    instructions TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'void')),
    issued_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_prescriptions_consultation ON prescriptions(consultation_id);
CREATE INDEX idx_prescriptions_pet ON prescriptions(clinic_id, pet_id, issued_at);

CREATE TABLE prescription_items (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    prescription_id TEXT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    medication_id TEXT REFERENCES medications(id) ON DELETE SET NULL,
    medication_name TEXT NOT NULL,
    strength TEXT NOT NULL DEFAULT '',
    dose_amount TEXT NOT NULL DEFAULT '',
    dose_unit TEXT NOT NULL DEFAULT '',
    route TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT '',
    duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
    quantity_dispensed INTEGER NOT NULL DEFAULT 0 CHECK (quantity_dispensed >= 0),
    instructions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX idx_prescription_items_prescription ON prescription_items(prescription_id);
