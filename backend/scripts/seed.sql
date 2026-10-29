-- Development seed for the CURRENT schema (post 000011_case_transfers).
-- Load with: scripts/migrate.sh && psql "$DATABASE_URL" -f scripts/seed.sql
--
-- Two clinics so cross-clinic flows (case transfer) can be exercised locally.
-- Every user's password is "admin123".
-- Sequences are setval'd at the bottom — never remove that; explicit ids in
-- this file desynchronize SERIAL sequences otherwise.

BEGIN;

INSERT INTO clinics (id, name, address, phone, email, settings) VALUES
(1, 'Baan Sathorn Animal Clinic', '12 Sathorn Soi 1, Bangkok', '02 112 3456', 'hello@baansathorn.vet',
 '{"tax_rate": 0.07, "currency": "THB", "opening_hours": "09:00-20:00", "invoice_prefix": "INV"}'),
(2, 'Riverside Veterinary Referral', '88 Charoen Krung 43, Bangkok', '02 887 1100', 'intake@riverside.vet',
 '{"tax_rate": 0.07, "currency": "THB"}');

-- Password hash for "admin123" (bcrypt)
INSERT INTO users (id, clinic_id, email, password_hash, name, role, phone) VALUES
(1, 1, 'admin@baansathorn.vet',   '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'Mai Rattana',       'admin',        '081 111 0001'),
(2, 1, 'pim@baansathorn.vet',     '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'Dr. Pim Chaiyasit', 'veterinarian', '081 111 0002'),
(3, 1, 'nok@baansathorn.vet',     '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'Nok Srisuk',        'receptionist', '081 111 0003'),
(4, 1, 'beer@baansathorn.vet',    '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'Beer Chaiyaphon',   'pharmacist',   '081 111 0004'),
(5, 2, 'admin@riverside.vet',     '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'Riverside Admin',   'admin',        '082 222 0001'),
(6, 2, 'vet@riverside.vet',       '$2a$10$oA//KhmIfPXsOwuqwI0DBOmo0/frBFwr0z7eegtHK4j8K8NE6QDTa', 'Dr. Noon Rak',      'veterinarian', '082 222 0002');

-- Global vaccine protocols are seeded by migration 000006 — don't duplicate them here.

INSERT INTO owners (id, clinic_id, name, phone, email, national_id, notes, preferred_channel) VALUES
(1, 1, 'Kanya Thongdee', '081 234 5678', 'kanya@example.com', NULL, 'Prefers LINE in the morning.', 'line'),
(2, 1, 'Somchai Prasert', '089 876 5432', 'somchai@example.com', NULL, NULL, 'sms'),
(3, 1, 'Lisa Mueller', '062 555 0199', 'lisa.m@example.com', NULL, NULL, 'email'),
(4, 1, 'Anan Kittisak', '095 111 2233', 'anan@example.com', NULL, NULL, 'line');

INSERT INTO patients (id, clinic_id, mrn, name, species, breed, date_of_birth, weight, owner_id, status) VALUES
(1, 1, 'PT-2026-0001', 'Moo Daeng', 'Dog', 'Thai Ridgeback', '2021-03-12', 24.5, 1, 'Active'),
(2, 1, 'PT-2026-0002', 'Khao Niao', 'Cat', 'Khao Manee', '2019-08-02', 4.2, 1, 'Active'),
(3, 1, 'PT-2026-0003', 'Tiger', 'Dog', 'Golden Retriever', '2017-11-20', 32.0, 2, 'Active'),
(4, 1, 'PT-2026-0004', 'Mochi', 'Rabbit', 'Holland Lop', '2023-05-14', 1.8, 3, 'Active'),
(5, 1, 'PT-2026-0005', 'Pla Too', 'Cat', 'Domestic Shorthair', '2022-01-09', 5.1, 4, 'Active');

INSERT INTO appointments (id, clinic_id, custom_id, patient_id, patient_name, owner_name, date, time, type, status, veterinarian_id, veterinarian_name, created_by) VALUES
(1, 1, 'APT-1', 3, 'Tiger', 'Somchai Prasert', CURRENT_DATE, '09:00', 'Checkup', 'Completed', 2, 'Dr. Pim Chaiyasit', 3),
(2, 1, 'APT-2', 1, 'Moo Daeng', 'Kanya Thongdee', CURRENT_DATE, '10:00', 'Vaccination', 'Checked In', 2, 'Dr. Pim Chaiyasit', 3),
(3, 1, 'APT-3', 4, 'Mochi', 'Lisa Mueller', CURRENT_DATE + 1, '11:30', 'Checkup', 'Scheduled', 2, 'Dr. Pim Chaiyasit', 3);

INSERT INTO visits (id, clinic_id, custom_id, patient_id, pet_name, owner_name, type, purpose, status,
                    chief_complaint, vitals, examination, differential_diagnosis, final_diagnosis,
                    treatment, advice, medications, billing_status, assigned_vet_id, assigned_vet_name, created_by) VALUES
(1, 1, 'VIS-1', 3, 'Tiger', 'Somchai Prasert', 'OPD', 'Limping, right hind leg', 'Closed',
 'Limping RH x 3 days, worse after running.',
 '{"weightKg": "32.4", "tempC": "38.6", "heartRate": "96", "respRate": "22"}',
 'Mild lameness RH, grade 2/5. Pain on stifle flexion, no drawer sign.',
 'Cranial cruciate ligament sprain', 'Soft tissue strain, right stifle',
 'Rest 7 days, NSAID course (Meloxicam).', 'Leash walks only, recheck in 7 days.',
 '[{"name": "Meloxicam 1.5 mg/ml oral", "dose": "0.1 mg/kg", "route": "PO", "frequency": "SID", "duration": "7 days"}]',
 'Sent', 2, 'Dr. Pim Chaiyasit', 2);

INSERT INTO prescriptions (id, clinic_id, custom_id, visit_id, patient_id, pet_name, owner_name, date,
                           veterinarian_id, veterinarian_name, diagnosis, medicines, notes) VALUES
(1, 1, 'RX-1', 1, 3, 'Tiger', 'Somchai Prasert', CURRENT_DATE,
 2, 'Dr. Pim Chaiyasit', 'Soft tissue strain, right stifle',
 '[{"name": "Meloxicam 1.5 mg/ml oral 10ml", "dose": "0.1 mg/kg", "route": "PO", "frequency": "SID", "duration": "7 days", "quantity": 1}]',
 'Give with food. Return if vomiting or worsening lameness.');

INSERT INTO bills (id, clinic_id, custom_id, visit_id, patient_id, pet_name, owner_name, date,
                   items, subtotal, tax, discount, total, status, payment_method, created_by) VALUES
(1, 1, 'BILL-1', 1, 3, 'Tiger', 'Somchai Prasert', CURRENT_DATE,
 '[{"description": "Consultation", "quantity": 1, "price": 500.00}, {"description": "Meloxicam 1.5 mg/ml oral 10ml", "quantity": 1, "price": 420.00}]',
 920.00, 92.00, 0, 1012.00, 'Pending', NULL, 3);

INSERT INTO bill_payments (id, clinic_id, bill_id, amount, method, recorded_by) VALUES
(1, 1, 1, 500.00, 'cash', 3);

INSERT INTO vaccinations (id, clinic_id, patient_id, vaccine_name, manufacturer, lot_number, administered_date, next_due_date, administered_by_vet_id, notes) VALUES
(1, 1, 3, 'Rabies', 'Zoetis', 'RAB-2510C', CURRENT_DATE - 30, CURRENT_DATE + 335, 2, 'Annual booster.'),
(2, 1, 1, 'DA2PP', 'MSD Animal Health', 'DHP-2608F', CURRENT_DATE - 200, CURRENT_DATE + 165, 2, NULL),
(3, 1, 5, 'FVRCP', 'Zoetis', 'FVR-2603B', CURRENT_DATE - 100, CURRENT_DATE + 265, 2, NULL);

INSERT INTO suppliers (id, clinic_id, name, phone, email, address) VALUES
(1, 1, 'Thai Vet Pharma Co.', '02 712 3456', 'sales@thaivetpharma.co.th', 'Bangna, Bangkok'),
(2, 1, 'Bangkok Animal Health', '02 998 1122', 'orders@bkkah.com', 'Rama 3, Bangkok');

INSERT INTO inventory_items (id, clinic_id, name, category, unit, reorder_level, selling_price) VALUES
(1, 1, 'Meloxicam 1.5 mg/ml oral 10ml', 'medicine', 'bottle', 5, 420.00),
(2, 1, 'Amoxicillin 250 mg tablet', 'medicine', 'tablet', 50, 15.00),
(3, 1, 'Rabies vaccine', 'vaccine', 'dose', 10, 350.00),
(4, 1, 'DHPPi vaccine', 'vaccine', 'dose', 10, 550.00),
(5, 1, 'Cohesive bandage 5cm', 'supply', 'roll', 20, 90.00);

INSERT INTO inventory_lots (id, clinic_id, item_id, lot_number, quantity, expiry_date, supplier_id, cost_per_unit, received_date) VALUES
(1, 1, 1, 'MEL-2609A', 60, '2027-09-30', 1, 260.00, '2026-09-20'),
(2, 1, 2, 'AMX-2611C', 24, '2026-11-10', 1, 9.00, '2026-09-25'),
(3, 1, 3, 'RAB-2610B', 10, '2026-11-05', 2, 210.00, '2026-10-02'),
(4, 1, 4, 'DHP-2608F', 2, '2027-08-15', 2, 330.00, '2026-10-05'),
(5, 1, 5, 'BND-2609D', 6, '2028-01-01', 1, 52.00, '2026-09-12');

INSERT INTO stock_movements (id, clinic_id, lot_id, delta, reason, user_id, notes, created_at) VALUES
(1, 1, 1, 60, 'stock_in', 4, 'initial receipt', '2026-09-20 09:00'),
(2, 1, 2, 24, 'stock_in', 4, 'initial receipt', '2026-09-25 09:00'),
(3, 1, 3, 10, 'stock_in', 4, 'initial receipt', '2026-10-02 09:00'),
(4, 1, 4, 8, 'stock_in', 4, 'initial receipt', '2026-10-05 09:00'),
(5, 1, 5, 100, 'stock_in', 4, 'initial receipt', '2026-09-12 09:00'),
(6, 1, 3, -2, 'stock_out', 2, 'Rabies dose — Moo Daeng', CURRENT_DATE);

INSERT INTO audit_logs (id, clinic_id, user_id, action, entity_type, entity_id) VALUES
(1, 1, 3, 'bill.payment_recorded', 'bill', 1);

-- Serial sequences: this seed uses explicit ids, so realign every sequence it touched.
SELECT setval('clinics_id_seq',          (SELECT MAX(id) FROM clinics));
SELECT setval('users_id_seq',            (SELECT MAX(id) FROM users));
SELECT setval('owners_id_seq',           (SELECT MAX(id) FROM owners));
SELECT setval('patients_id_seq',         (SELECT MAX(id) FROM patients));
SELECT setval('appointments_id_seq',     (SELECT MAX(id) FROM appointments));
SELECT setval('visits_id_seq',           (SELECT MAX(id) FROM visits));
SELECT setval('prescriptions_id_seq',    (SELECT MAX(id) FROM prescriptions));
SELECT setval('bills_id_seq',            (SELECT MAX(id) FROM bills));
SELECT setval('bill_payments_id_seq',    (SELECT MAX(id) FROM bill_payments));
SELECT setval('vaccinations_id_seq',     (SELECT MAX(id) FROM vaccinations));
SELECT setval('suppliers_id_seq',        (SELECT MAX(id) FROM suppliers));
SELECT setval('inventory_items_id_seq',  (SELECT MAX(id) FROM inventory_items));
SELECT setval('inventory_lots_id_seq',   (SELECT MAX(id) FROM inventory_lots));
SELECT setval('stock_movements_id_seq',  (SELECT MAX(id) FROM stock_movements));
SELECT setval('audit_logs_id_seq',       (SELECT MAX(id) FROM audit_logs));

COMMIT;
