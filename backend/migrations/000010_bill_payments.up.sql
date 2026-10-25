-- bill_payments: partial payments and payment history per bill
CREATE TABLE bill_payments (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    bill_id INT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    reference VARCHAR(100),
    notes TEXT,
    recorded_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bill_payments_bill_id ON bill_payments(bill_id);
CREATE INDEX idx_bill_payments_clinic_id ON bill_payments(clinic_id);
