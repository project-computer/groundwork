-- Seed data for development.
-- Run AFTER all migrations (migrations/*.up.sql), e.g.:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/seed.sql
--
-- All staff accounts use password "admin123" (bcrypt hash below).
-- Idempotent-ish: truncates the seeded tables first, so re-running is safe.

TRUNCATE audit_logs, bill_payments, bills, prescriptions, vaccinations, stock_movements,
         inventory_lots, inventory_items, suppliers, visits, appointments, patients, owners,
         users, clinics RESTART IDENTITY CASCADE;

-- Clinic (tenant)
INSERT INTO clinics (id, name, address, phone, email, settings) VALUES
(1, 'Happy Paws Veterinary Clinic', '123 Main Street, City, State 12345', '+1-555-0100', 'info@happypaws.vet',
 '{"tax_rate": 0.10, "appointment_duration": 30, "currency": "USD", "openingHours": "09:00-20:00"}');
SELECT setval('clinics_id_seq', 1);

-- Users (password: admin123 for all)
INSERT INTO users (id, clinic_id, name, email, password_hash, role, phone, is_active) VALUES
(1, 1, 'Dr. Sarah Johnson', 'admin@happypaws.vet',   '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'admin',        '+1-555-0101', true),
(2, 1, 'Dr. Michael Chen',  'mchen@happypaws.vet',   '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'veterinarian', '+1-555-0102', true),
(3, 1, 'Emily Rodriguez',   'emily@happypaws.vet',   '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'receptionist', '+1-555-0103', true),
(4, 1, 'James Wilson',      'jwilson@happypaws.vet', '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'pharmacist',   '+1-555-0104', true);
SELECT setval('users_id_seq', 4);

-- Owners (one per person; patients link via owner_id)
INSERT INTO owners (id, clinic_id, name, phone, email) VALUES
(1, 1, 'John Smith',   '+1-555-1001', 'john.smith@email.com'),
(2, 1, 'Mary Johnson', '+1-555-1002', 'mary.j@email.com'),
(3, 1, 'Robert Davis', '+1-555-1003', 'robert.d@email.com');
SELECT setval('owners_id_seq', 3);

-- Patients (MRN format PT-YYYY-NNNN per CONTEXT.md vocabulary)
INSERT INTO patients (id, clinic_id, mrn, name, species, breed, date_of_birth, weight, owner_id, status) VALUES
(1, 1, 'PT-' || to_char(CURRENT_DATE, 'YYYY') || '-0001', 'Max',     'Dog', 'Golden Retriever', CURRENT_DATE - 1826, 30.5, 1, 'Active'),
(2, 1, 'PT-' || to_char(CURRENT_DATE, 'YYYY') || '-0002', 'Luna',    'Cat', 'Persian',          CURRENT_DATE - 1096,  4.2, 2, 'Active'),
(3, 1, 'PT-' || to_char(CURRENT_DATE, 'YYYY') || '-0003', 'Charlie', 'Dog', 'Beagle',           CURRENT_DATE - 913,  12.8, 3, 'Active');
SELECT setval('patients_id_seq', 3);

-- Appointments (snapshot columns patient_name/owner_name kept per migration 000004)
INSERT INTO appointments (clinic_id, custom_id, patient_id, patient_name, owner_name, date, time, type, status, veterinarian_id, veterinarian_name, created_by) VALUES
(1, 'APT-1', 1, 'Max',     'John Smith', CURRENT_DATE,     '10:00', 'Checkup',     'Completed', 2, 'Dr. Michael Chen', 3),
(1, 'APT-2', 2, 'Luna',    'Mary Johnson', CURRENT_DATE,   '11:00', 'Vaccination', 'Scheduled', 2, 'Dr. Michael Chen', 3),
(1, 'APT-3', 3, 'Charlie', 'Robert Davis', CURRENT_DATE + 1, '09:00', 'Checkup',   'Scheduled', 1, 'Dr. Sarah Johnson', 3);
SELECT setval('appointments_id_seq', 3);

-- A completed visit with full clinical content
INSERT INTO visits (
    clinic_id, custom_id, patient_id, appointment_id, pet_name, owner_name, type, purpose, status,
    assigned_vet_id, assigned_vet_name, steps, chief_complaint, vitals, examination, final_diagnosis,
    treatment, advice, medications, billing_status, created_by
) VALUES (
    1, 'V-1', 1, 1, 'Max', 'John Smith', 'OPD', 'Routine Checkup', 'Complete',
    2, 'Dr. Michael Chen',
    '{"basicInfo": true, "chiefComplaint": true, "vitals": true, "examination": true, "diagnosis": true, "treatment": true}',
    'Annual wellness check',
    '{"temperature": 38.5, "heartRate": 120, "respiratoryRate": 25, "weight": 30.5}',
    'Patient appears healthy. Coat condition good. Eyes, ears, and teeth normal. No abnormal findings.',
    'Healthy - Annual checkup complete',
    'Continue current diet and exercise routine. Annual vaccination recommended.',
    'Routine care advised. Return for annual checkup next year.',
    '[{"name": "Multivitamin", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "instructions": "Give with food"}]',
    'Sent',
    2
);
SELECT setval('visits_id_seq', 1);

-- Bill with a recorded partial payment (balance 10.00)
INSERT INTO bills (id, clinic_id, custom_id, visit_id, patient_id, pet_name, owner_name, date, items, subtotal, tax, discount, total, status, payment_method, created_by) VALUES
(1, 1, 'BIL-1', 1, 1, 'Max', 'John Smith', CURRENT_DATE,
 '[{"description": "Consultation Fee", "quantity": 1, "price": 50.00}, {"description": "Physical Examination", "quantity": 1, "price": 30.00}, {"description": "Multivitamin (30 days)", "quantity": 1, "price": 20.00}]',
 100.00, 10.00, 0.00, 110.00, 'Partial', 'Cash', 2);
INSERT INTO bill_payments (clinic_id, bill_id, amount, method, reference, recorded_by) VALUES
(1, 1, 100.00, 'Cash', 'receipt-0001', 3);
SELECT setval('bills_id_seq', 1);
SELECT setval('bill_payments_id_seq', 1);

-- Prescription
INSERT INTO prescriptions (clinic_id, custom_id, visit_id, patient_id, pet_name, owner_name, date, veterinarian_id, veterinarian_name, diagnosis, medicines) VALUES
(1, 'RX-1', 1, 1, 'Max', 'John Smith', CURRENT_DATE, 2, 'Dr. Michael Chen',
 'Routine wellness - preventative care',
 '[{"name": "Multivitamin", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "instructions": "Give with food in the morning"}]');
SELECT setval('prescriptions_id_seq', 1);

-- Global vaccine protocols are seeded by migration 000006 — not re-seeded here
-- (the table is global and UNIQUE (name, species)).

-- Vaccination history (Rabies due for a booster soon, per reminder windows)
INSERT INTO vaccinations (clinic_id, patient_id, visit_id, administered_by_vet_id, vaccine_name, lot_number, administered_date, next_due_date) VALUES
(1, 1, 1, 2, 'Rabies', 'RAB-2510A', CURRENT_DATE - 360, CURRENT_DATE + 5),
(1, 2, NULL, 2, 'FVRCP', 'FVR-2509B', CURRENT_DATE - 200, CURRENT_DATE + 165);
SELECT setval('vaccinations_id_seq', 2);

-- Suppliers + inventory
INSERT INTO suppliers (id, clinic_id, name, phone, email) VALUES
(1, 1, 'Thai Vet Pharma Co.', '+1-555-0200', 'sales@thaivetpharma.co.th'),
(2, 1, 'Metro Animal Health', '+1-555-0201', 'orders@metroah.com');
SELECT setval('suppliers_id_seq', 2);

INSERT INTO inventory_items (id, clinic_id, name, category, unit, reorder_level, selling_price) VALUES
(1, 1, 'Meloxicam 1.5 mg/ml oral 10ml', 'medicine', 'bottle', 5,  420.00),
(2, 1, 'Amoxicillin 250 mg tablet',     'medicine', 'tablet', 50,  15.00),
(3, 1, 'Rabies vaccine',                'vaccine',  'dose',   10, 350.00),
(4, 1, 'Cohesive bandage 5cm',          'supply',   'roll',   20,  90.00);
SELECT setval('inventory_items_id_seq', 4);

INSERT INTO inventory_lots (id, clinic_id, item_id, lot_number, quantity, expiry_date, supplier_id, cost_per_unit, received_date) VALUES
(1, 1, 1, 'MEL-2609A', 60, CURRENT_DATE + 320, 1, 260.00, CURRENT_DATE - 30),
(2, 1, 2, 'AMX-2611C', 24, CURRENT_DATE + 15,  1,   9.00, CURRENT_DATE - 25),
(3, 1, 3, 'RAB-2610B', 10, CURRENT_DATE + 10,  2, 210.00, CURRENT_DATE - 20),
(4, 1, 4, 'BND-2609D',  6, CURRENT_DATE + 400, 1,  52.00, CURRENT_DATE - 40);
SELECT setval('inventory_lots_id_seq', 4);

-- Append-only stock ledger (quantity-on-hand is the projection of these rows)
INSERT INTO stock_movements (clinic_id, lot_id, delta, reason, user_id, notes) VALUES
(1, 1, 60, 'stock_in', 4, 'initial receipt'),
(1, 2, 24, 'stock_in', 4, 'initial receipt'),
(1, 3, 10, 'stock_in', 4, 'initial receipt'),
(1, 4,  6, 'stock_in', 4, 'initial receipt'),
(1, 1, -1, 'stock_out', 2, 'dispensed for V-1');
SELECT setval('stock_movements_id_seq', 5);

-- Audit sample
INSERT INTO audit_logs (clinic_id, user_id, action, entity_type, entity_id, new_values) VALUES
(1, 3, 'bill.payment_recorded', 'bill', 1, '{"amount": 100.00, "method": "cash"}');
