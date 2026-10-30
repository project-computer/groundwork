-- 000004_add_users_clinic_id
-- ADR-0004 (defer-but-ready multi-tenancy): every operational table carries clinic_id.
-- Until this migration, users lacked it, so the JWT-claim tenant-extraction path that
-- auth.GetClinicID() will become on activation wasn't physically possible.
-- This adds the column with NOT NULL DEFAULT 1, satisfying the resolver's present
-- "return 1" implementation while leaving the schema ready for activation.

ALTER TABLE users
    ADD COLUMN clinic_id INT NOT NULL DEFAULT 1 REFERENCES clinics(id);

CREATE INDEX idx_users_clinic_id ON users(clinic_id);
