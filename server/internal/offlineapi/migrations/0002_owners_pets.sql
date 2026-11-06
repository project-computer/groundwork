-- 002: owners and pets. Patient identity is UUID plus a human MRN.
CREATE TABLE owners (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    secondary_contact_name TEXT NOT NULL DEFAULT '',
    secondary_contact_phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_owners_clinic_name ON owners(clinic_id, name);
CREATE INDEX idx_owners_phone ON owners(clinic_id, phone);

CREATE TABLE pets (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    mrn TEXT NOT NULL,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT NOT NULL DEFAULT '',
    sex TEXT NOT NULL DEFAULT 'unknown' CHECK (sex IN ('male', 'female', 'unknown')),
    date_of_birth TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    microchip_number TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (clinic_id, mrn)
);
CREATE INDEX idx_pets_owner ON pets(clinic_id, owner_id);
CREATE INDEX idx_pets_name ON pets(clinic_id, name);
CREATE UNIQUE INDEX idx_pets_microchip ON pets(clinic_id, microchip_number)
    WHERE microchip_number <> '';
