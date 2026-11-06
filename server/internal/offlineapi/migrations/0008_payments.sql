-- 008: payments and their allocation to invoices.
CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    amount_satang INTEGER NOT NULL CHECK (amount_satang > 0),
    method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'transfer', 'other')),
    reference TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'void')),
    received_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);

CREATE TABLE payment_allocations (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    amount_satang INTEGER NOT NULL CHECK (amount_satang > 0),
    created_at TEXT NOT NULL
);
CREATE INDEX idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice ON payment_allocations(invoice_id);
