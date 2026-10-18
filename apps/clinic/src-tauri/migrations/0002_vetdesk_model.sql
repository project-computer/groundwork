DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS visit_items;
DROP TABLE IF EXISTS products_services;
DROP TABLE IF EXISTS medical_records;
DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS owners;

CREATE TABLE patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT NOT NULL DEFAULT '',
    sex TEXT NOT NULL DEFAULT 'Unknown',
    birth_date TEXT NOT NULL DEFAULT '',
    weight_kg TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    owner_phone TEXT NOT NULL DEFAULT '',
    owner_email TEXT NOT NULL DEFAULT '',
    allergies TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_patients_name ON patients(name);
CREATE INDEX idx_patients_owner ON patients(owner_name);

CREATE TABLE appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    date_time TEXT NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 30,
    reason TEXT NOT NULL DEFAULT '',
    vet TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('scheduled','checked-in','in-consult','completed','cancelled','no-show')),
    notes TEXT NOT NULL DEFAULT '',
    checked_in_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    record_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_date ON appointments(date_time);
CREATE INDEX idx_appointments_status ON appointments(status);

CREATE TABLE medical_records (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id TEXT,
    vet TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    paid INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_records_patient ON medical_records(patient_id);
CREATE INDEX idx_records_appointment ON medical_records(appointment_id);

CREATE TABLE clinic_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
