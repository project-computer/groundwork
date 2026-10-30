-- 000005_patient_vocabulary_and_mrn
-- Slice 0002: align schema with the Patient vocabulary resolved in the grilling session.
-- 1. Rename pets → patients (vocabulary: Patient per CONTEXT.md, not Pet)
-- 2. Rename every FK column pet_id → patient_id
-- 3. Rename cosmetic pet_name → patient_name on appointments
-- 4. Rename patients.custom_id → patients.mrn (CONTEXT.md: MRN = Medical Record Number)
--    Backfill existing rows to PT-YYYY-NNNN format
-- 5. Replace patients.age DECIMAL with patients.date_of_birth DATE nullable
-- Owners columns (owner_name, owner_phone, etc.) deliberately NOT dropped here — that
-- happens in 000006_owners, which reads from patients.owner_* before dropping them.

-- Rename table
ALTER TABLE pets RENAME TO patients;

-- Rename FK columns on every child table that references pets.
-- IF EXISTS guards tables that were dropped in 000001 (opd/ipd_records) or never
-- created there (case_transfers — its CREATE TABLE ships in 000011_case_transfers).
ALTER TABLE IF EXISTS appointments     RENAME COLUMN pet_id TO patient_id;
ALTER TABLE IF EXISTS bills            RENAME COLUMN pet_id TO patient_id;
ALTER TABLE IF EXISTS prescriptions    RENAME COLUMN pet_id TO patient_id;
ALTER TABLE IF EXISTS visits           RENAME COLUMN pet_id TO patient_id;
ALTER TABLE IF EXISTS case_transfers   RENAME COLUMN pet_id TO patient_id;
-- visit_images shipped in 000001 WITHOUT a pet_id column; rename only if a
-- legacy database happens to have it (Postgres has no RENAME COLUMN IF EXISTS).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'visit_images' AND column_name = 'pet_id'
    ) THEN
        ALTER TABLE visit_images RENAME COLUMN pet_id TO patient_id;
    END IF;
END $$;
ALTER TABLE IF EXISTS opd_records      RENAME COLUMN pet_id TO patient_id;
ALTER TABLE IF EXISTS ipd_records      RENAME COLUMN pet_id TO patient_id;

-- Rename cosmetic pet_name → patient_name on appointments (per CONTEXT.md vocabulary).
-- visits/prescriptions/bills/case_transfers keep pet_name as a snapshot column; the
-- immutable clinical history should always reference the animal by its name as
-- recorded. Cosmetic rename is restricted to appointments where it affects UI labels.
ALTER TABLE appointments RENAME COLUMN pet_name TO patient_name;

-- Rename primary key sequence to match table rename
ALTER SEQUENCE pets_id_seq RENAME TO patients_id_seq;

-- Rename MRN: custom_id → mrn
ALTER TABLE patients RENAME COLUMN custom_id TO mrn;

-- Backfill MRN format PT-YYYY-NNNN for rows whose MRN isn't already in that shape.
-- We use UPDATE ... FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY year) ...) to
-- generate sequential numbers per year. Existing rows that already match the format
-- (e.g. from re-runs) are kept as-is via WHERE clause.
UPDATE patients p
SET mrn = 'PT-' || y.year::TEXT || '-' || LPAD(y.seq::TEXT, 4, '0')
FROM (
    SELECT
        id,
        EXTRACT(YEAR FROM COALESCE(created_at, NOW()))::INT AS year,
        ROW_NUMBER() OVER (
            PARTITION BY EXTRACT(YEAR FROM COALESCE(created_at, NOW()))
            ORDER BY id
        ) AS seq
    FROM patients
    WHERE mrn IS NULL OR mrn !~ '^PT-[0-9]{4}-[0-9]{4}$'
) y
WHERE p.id = y.id;

-- Enforce MRN uniqueness (was unique on custom_id)
ALTER TABLE patients ADD CONSTRAINT patients_mrn_unique UNIQUE (mrn);

-- Replace age DECIMAL with date_of_birth DATE
ALTER TABLE patients DROP COLUMN age;
ALTER TABLE patients ADD COLUMN date_of_birth DATE;

-- Drop the now-unused pets_owner_phone index (it was on owner_phone, not pets_id, so
-- this stays a soft rename — leave it; the 000006_owners down migration recreates it on
-- patients.owner_phone anyway.)

-- Rename index too
ALTER INDEX IF EXISTS idx_pets_clinic_id     RENAME TO idx_patients_clinic_id;
ALTER INDEX IF EXISTS idx_pets_owner_id      RENAME TO idx_patients_owner_id;
ALTER INDEX IF EXISTS idx_pets_owner_phone   RENAME TO idx_patients_owner_phone;
