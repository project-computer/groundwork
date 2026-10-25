-- Reverse 000007_vaccinations_and_protocols.

DROP INDEX IF EXISTS idx_vaccinations_vaccine_name;
DROP INDEX IF EXISTS idx_vaccinations_next_due_date;
DROP INDEX IF EXISTS idx_vaccinations_patient_id;
DROP INDEX IF EXISTS idx_vaccinations_clinic_id;
DROP TABLE IF EXISTS vaccinations CASCADE;
DROP TABLE IF EXISTS vaccine_protocols CASCADE;
