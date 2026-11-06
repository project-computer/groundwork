-- 007: service catalog, invoices, invoice items. Money is integer satang.
CREATE TABLE services (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'service' CHECK (category IN ('service', 'product')),
    unit TEXT NOT NULL DEFAULT 'unit',
    unit_price_satang INTEGER NOT NULL CHECK (unit_price_satang >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_services_clinic_name ON services(clinic_id, name);

CREATE TABLE invoices (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    pet_id TEXT REFERENCES pets(id) ON DELETE SET NULL,
    consultation_id TEXT REFERENCES consultations(id) ON DELETE SET NULL,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'void')),
    subtotal_satang INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_satang >= 0),
    discount_satang INTEGER NOT NULL DEFAULT 0 CHECK (discount_satang >= 0),
    tax_satang INTEGER NOT NULL DEFAULT 0 CHECK (tax_satang >= 0),
    total_satang INTEGER NOT NULL DEFAULT 0 CHECK (total_satang >= 0),
    notes TEXT NOT NULL DEFAULT '',
    issued_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (clinic_id, invoice_number)
);
CREATE INDEX idx_invoices_date ON invoices(clinic_id, issued_at);
CREATE INDEX idx_invoices_owner ON invoices(clinic_id, owner_id);

CREATE TABLE invoice_items (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_satang INTEGER NOT NULL CHECK (unit_price_satang >= 0),
    discount_satang INTEGER NOT NULL DEFAULT 0 CHECK (discount_satang >= 0),
    line_total_satang INTEGER NOT NULL CHECK (line_total_satang >= 0),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
