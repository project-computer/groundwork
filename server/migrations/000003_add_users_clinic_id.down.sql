-- Reverse 000004_add_users_clinic_id.

DROP INDEX IF EXISTS idx_users_clinic_id;
ALTER TABLE users DROP COLUMN clinic_id;
