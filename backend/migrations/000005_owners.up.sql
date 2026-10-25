-- Owners as first-class entity (ADR-0001)
-- 1. Create owners table
-- 2. Backfill from pets by deduping on (owner_phone, COALESCE(owner_national_id, ''))
-- 3. Link pets.owner_id
-- 4. Drop denormalized owner_* columns

CREATE TABLE owners (
    id SERIAL PRIMARY KEY,
    clinic_id INT NOT NULL REFERENCES clinics(id),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    national_id VARCHAR(100),
    notes TEXT,
    secondary_contact JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_owners_unique_key
    ON owners (clinic_id, phone, COALESCE(national_id, ''));

CREATE INDEX idx_owners_clinic_id ON owners(clinic_id);
CREATE INDEX idx_owners_phone ON owners(phone);

-- Backfill: one owner per (clinic_id, phone, national_id-or-empty), picking earliest patient row.
-- NOTE: refs `patients` (renamed from `pets` in 000005). Owner columns still on `patients` here;
-- they are dropped at the bottom of THIS migration, after patients.owner_id is populated.
INSERT INTO owners (clinic_id, name, phone, email, national_id, notes)
SELECT clinic_id, name, phone, email, national_id, notes
FROM (
    SELECT
        clinic_id, owner_name AS name, owner_phone AS phone,
        owner_email AS email, owner_national_id AS national_id, owner_notes AS notes,
        ROW_NUMBER() OVER (
            PARTITION BY clinic_id, owner_phone, COALESCE(owner_national_id, '')
            ORDER BY id
        ) AS rn
    FROM patients
    WHERE deleted_at IS NULL
) ranked
WHERE rn = 1;

-- Add owner_id to patients
ALTER TABLE patients ADD COLUMN owner_id INT REFERENCES owners(id);

-- Populate patients.owner_id from backfilled owners
UPDATE patients p
SET owner_id = o.id
FROM owners o
WHERE o.clinic_id = p.clinic_id
  AND o.phone = p.owner_phone
  AND COALESCE(o.national_id, '') = COALESCE(p.owner_national_id, '');

-- Enforce NOT NULL now that backfill is complete
ALTER TABLE patients ALTER COLUMN owner_id SET NOT NULL;

CREATE INDEX idx_patients_owner_id ON patients(owner_id);

-- Drop legacy owner_label (absorbed into owners.secondary_contact; no data moved for MVP)
ALTER TABLE patients DROP COLUMN owner_label;

-- Drop denormalized owner columns
ALTER TABLE patients DROP COLUMN owner_name;
ALTER TABLE patients DROP COLUMN owner_phone;
ALTER TABLE patients DROP COLUMN owner_email;
ALTER TABLE patients DROP COLUMN owner_national_id;
ALTER TABLE patients DROP COLUMN owner_notes;

-- Drop now-unused owner_phone index
DROP INDEX IF EXISTS idx_pets_owner_phone;

-- Sequence reset
SELECT setval('owners_id_seq', (SELECT MAX(id) FROM owners));