-- 000007_vaccinations_and_protocols
-- Per slice 0005: introduces vaccine_protocols (global, no clinic_id) and vaccinations
-- (clinic-scoped, FK to patients/visits/users). See docs/adr/0002-global-vaccine-protocol-table.md
-- and docs/issues/0005 for the full design.

CREATE TABLE vaccine_protocols (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    species VARCHAR(50) NOT NULL,
    default_interval_days INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed common veterinary vaccines per the slice spec.
INSERT INTO vaccine_protocols (name, species, default_interval_days) VALUES
    ('Rabies',          'dog', 365),
    ('Rabies',          'cat', 365),
    ('DA2PP',           'dog', 365),
    ('Bordetella',      'dog', 180),
    ('FVRCP',           'cat', 365),
    ('Feline Leukemia', 'cat', 365),
    ('Leptospirosis',   'dog', 365),
    ('Lyme',            'dog', 365);

CREATE TABLE vaccinations (
    id SERIAL PRIMARY KEY,
    clinic_id INT NOT NULL REFERENCES clinics(id),
    patient_id INT NOT NULL REFERENCES patients(id),
    visit_id INT REFERENCES visits(id),
    administered_by_vet_id INT REFERENCES users(id),
    vaccine_name VARCHAR(120) NOT NULL,
    manufacturer VARCHAR(120),
    lot_number VARCHAR(120),
    inventory_lot_id INT,
    administered_date DATE NOT NULL,
    next_due_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vaccinations_clinic_id        ON vaccinations(clinic_id);
CREATE INDEX idx_vaccinations_patient_id       ON vaccinations(patient_id);
CREATE INDEX idx_vaccinations_next_due_date    ON vaccinations(next_due_date);
CREATE INDEX idx_vaccinations_vaccine_name     ON vaccinations(vaccine_name);
