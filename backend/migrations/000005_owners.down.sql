-- Reverse 000006_owners

ALTER TABLE patients ADD COLUMN owner_name VARCHAR(255);
ALTER TABLE patients ADD COLUMN owner_phone VARCHAR(50);
ALTER TABLE patients ADD COLUMN owner_email VARCHAR(255);
ALTER TABLE patients ADD COLUMN owner_national_id VARCHAR(100);
ALTER TABLE patients ADD COLUMN owner_notes TEXT;
ALTER TABLE patients ADD COLUMN owner_label VARCHAR(50);

UPDATE patients p
SET owner_name = o.name,
    owner_phone = o.phone,
    owner_email = o.email,
    owner_national_id = o.national_id
FROM owners o
WHERE p.owner_id = o.id;

ALTER TABLE patients ALTER COLUMN owner_name SET NOT NULL;
ALTER TABLE patients ALTER COLUMN owner_phone SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pets_owner_phone ON patients(owner_phone);

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_owner_id_fkey;
ALTER TABLE patients DROP COLUMN owner_id;
DROP INDEX IF EXISTS idx_patients_owner_id;
DROP TABLE IF EXISTS owners CASCADE;
