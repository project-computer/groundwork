PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS owners (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT,
    sex TEXT CHECK (sex IN ('male', 'female')),
    date_of_birth TEXT,
    weight_value REAL,
    weight_unit TEXT CHECK (weight_unit IN ('kg', 'g')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK ((weight_value IS NULL) = (weight_unit IS NULL))
);

CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    scheduled_at TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'checked_in', 'completed', 'cancelled', 'no_show')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
    appointment_id TEXT REFERENCES appointments(id) ON DELETE RESTRICT,
    visited_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medical_records (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
    record_type TEXT NOT NULL CHECK (record_type IN ('note', 'diagnosis', 'treatment', 'medication')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products_services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('product', 'service')),
    unit TEXT NOT NULL,
    current_price_minor INTEGER NOT NULL CHECK (current_price_minor >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visit_items (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
    product_id TEXT REFERENCES products_services(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
    discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE RESTRICT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
    paid_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owners_name ON owners(name);
CREATE INDEX IF NOT EXISTS idx_pets_name ON pets(name);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets(owner_id);
CREATE INDEX IF NOT EXISTS idx_appointments_pet ON appointments(pet_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_visits_pet ON visits(pet_id);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_medical_records_visit ON medical_records(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_items_visit ON visit_items(visit_id);
CREATE INDEX IF NOT EXISTS idx_payments_visit ON payments(visit_id);
