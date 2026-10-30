-- case_transfers: shareable bundle of one Patient's selected Visits, sent from
-- one clinic to another via a token-protected link (see CONTEXT.md). On receipt
-- the receiving clinic creates its own copy of the Patient and Visits, stamped
-- with original_clinic_id for audit. No rows are shared across clinics.
CREATE TABLE case_transfers (
    id SERIAL PRIMARY KEY,
    from_clinic_id INT REFERENCES clinics(id),
    to_clinic_id INT REFERENCES clinics(id),
    patient_id INT REFERENCES patients(id),
    visit_ids INT[] NOT NULL DEFAULT '{}',
    token VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    note TEXT,
    created_by INT REFERENCES users(id),
    accepted_by INT REFERENCES users(id),
    accepted_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_case_transfers_token ON case_transfers(token);
CREATE INDEX idx_case_transfers_from_clinic_id ON case_transfers(from_clinic_id);
CREATE INDEX idx_case_transfers_to_clinic_id ON case_transfers(to_clinic_id);

-- Provenance stamps: copies created by an accepted transfer point back at the
-- originating clinic/rows. NULL = registered locally (the normal path).
ALTER TABLE patients ADD COLUMN original_clinic_id INT REFERENCES clinics(id);
ALTER TABLE patients ADD COLUMN original_patient_id INT;
ALTER TABLE visits ADD COLUMN original_clinic_id INT REFERENCES clinics(id);
ALTER TABLE visits ADD COLUMN original_visit_id INT;

CREATE INDEX idx_patients_original ON patients(original_clinic_id, original_patient_id);
CREATE INDEX idx_visits_original ON visits(original_clinic_id, original_visit_id);
