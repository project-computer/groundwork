-- Reverse 000005_patient_vocabulary_and_mrn.

-- Restore age column first so data isn't lost (NULL — original was DECIMAL anyway)
ALTER TABLE patients ADD COLUMN age DECIMAL(4,1);

-- Restore custom_id
ALTER TABLE patients RENAME COLUMN mrn TO custom_id;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_mrn_unique;

-- Restore dates on indexed tables
-- (Note: any per-row MRN format data is lost in down-migration because we only stored
--  the human-readable MRN, not the year/id components. Reverse is data-discarding in
--  that direction. Acceptable for dev; production down must use backup.)

-- Rename patient_id → pet_id on every FK
ALTER TABLE appointments     RENAME COLUMN patient_id TO pet_id;
ALTER TABLE bills            RENAME COLUMN patient_id TO pet_id;
ALTER TABLE prescriptions    RENAME COLUMN patient_id TO pet_id;
ALTER TABLE visits           RENAME COLUMN patient_id TO pet_id;
ALTER TABLE case_transfers   RENAME COLUMN patient_id TO pet_id;
ALTER TABLE visit_images     RENAME COLUMN patient_id TO pet_id;
ALTER TABLE opd_records      RENAME COLUMN patient_id TO pet_id;
ALTER TABLE ipd_records      RENAME COLUMN patient_id TO pet_id;

-- Rename patient_name → pet_name on appointments
ALTER TABLE appointments RENAME COLUMN patient_name TO pet_name;

-- Rename indexes
ALTER INDEX IF EXISTS idx_patients_clinic_id   RENAME TO idx_pets_clinic_id;
ALTER INDEX IF EXISTS idx_patients_owner_id    RENAME TO idx_pets_owner_id;
ALTER INDEX IF EXISTS idx_patients_owner_phone RENAME TO idx_pets_owner_phone;

-- Rename table last
ALTER TABLE patients RENAME TO pets;
ALTER SEQUENCE patients_id_seq RENAME TO pets_id_seq;
