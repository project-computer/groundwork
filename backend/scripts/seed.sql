-- Seed data for development

-- Insert default clinic
INSERT INTO clinics (id, name, address, phone, email, settings) VALUES
(1, 'Happy Paws Veterinary Clinic', '123 Main Street, City, State 12345', '+1-555-0100', 'info@happypaws.vet',
'{"tax_rate": 0.10, "appointment_duration": 30, "currency": "USD"}');

-- Insert users (password: admin123 for all)
-- Password hash for "admin123" using bcrypt
INSERT INTO users (name, email, password_hash, role, phone, is_active) VALUES
('Dr. Sarah Johnson', 'admin@happypaws.vet', '$2a$10$rQ6wHKm0P6Y9QTZVwGxJVOQxYxYxYxYxYxYxYxYxYxYxYxYxYxYxY', 'admin', '+1-555-0101', true),
('Dr. Michael Chen', 'mchen@happypaws.vet', '$2a$10$rQ6wHKm0P6Y9QTZVwGxJVOQxYxYxYxYxYxYxYxYxYxYxYxYxYxYxY', 'veterinarian', '+1-555-0102', true),
('Emily Rodriguez', 'emily@happypaws.vet', '$2a$10$rQ6wHKm0P6Y9QTZVwGxJVOQxYxYxYxYxYxYxYxYxYxYxYxYxYxYxY', 'receptionist', '+1-555-0103', true),
('James Wilson', 'james@happypaws.vet', '$2a$10$rQ6wHKm0P6Y9QTZVwGxJVOQxYxYxYxYxYxYxYxYxYxYxYxYxYxYxY', 'pharmacist', '+1-555-0104', true);

-- Insert sample pets
INSERT INTO pets (clinic_id, custom_id, name, species, breed, age, weight, owner_name, owner_phone, owner_email, status) VALUES
(1, 'C-1', 'Max', 'Dog', 'Golden Retriever', 5.0, 30.5, 'John Smith', '+1-555-1001', 'john.smith@email.com', 'Active'),
(1, 'C-2', 'Luna', 'Cat', 'Persian', 3.0, 4.2, 'Mary Johnson', '+1-555-1002', 'mary.j@email.com', 'Active'),
(1, 'C-3', 'Charlie', 'Dog', 'Beagle', 2.5, 12.8, 'Robert Davis', '+1-555-1003', 'robert.d@email.com', 'Active'),
(1, 'C-4', 'Bella', 'Cat', 'Siamese', 4.0, 3.9, 'Lisa Anderson', '+1-555-1004', 'lisa.a@email.com', 'Active'),
(1, 'C-5', 'Rocky', 'Dog', 'German Shepherd', 6.0, 35.0, 'David Wilson', '+1-555-1005', 'david.w@email.com', 'Active');

-- Insert sample appointments
INSERT INTO appointments (clinic_id, custom_id, pet_id, pet_name, owner_name, date, time, type, status, veterinarian_id, veterinarian_name, created_by) VALUES
(1, 'APT-1', 1, 'Max', 'John Smith', CURRENT_DATE, '10:00:00', 'Checkup', 'Scheduled', 2, 'Dr. Michael Chen', 3),
(1, 'APT-2', 2, 'Luna', 'Mary Johnson', CURRENT_DATE, '11:00:00', 'Vaccination', 'Scheduled', 2, 'Dr. Michael Chen', 3),
(1, 'APT-3', 3, 'Charlie', 'Robert Davis', CURRENT_DATE + 1, '09:00:00', 'Checkup', 'Scheduled', 1, 'Dr. Sarah Johnson', 3);

-- Insert a sample visit
INSERT INTO visits (
    clinic_id, custom_id, pet_id, appointment_id, pet_name, owner_name, type, purpose, status,
    assigned_vet_id, assigned_vet_name, steps, chief_complaint, vitals, examination, final_diagnosis,
    treatment, advice, medications, billing_status, created_by
) VALUES (
    1, 'V-1', 1, 1, 'Max', 'John Smith', 'OPD', 'Routine Checkup', 'Complete',
    2, 'Dr. Michael Chen',
    '{"basicInfo": true, "chiefComplaint": true, "vitals": true, "examination": true, "diagnosis": true, "treatment": true}',
    'Annual wellness check',
    '{"temperature": 38.5, "heartRate": 120, "respiratoryRate": 25, "weight": 30.5, "bloodPressure": "120/80"}',
    'Patient appears healthy. Coat condition good. Eyes, ears, and teeth normal. No abnormal findings.',
    'Healthy - Annual checkup complete',
    'Continue current diet and exercise routine. Annual vaccination recommended.',
    'Routine care advised. Return for annual checkup next year.',
    '[{"name": "Multivitamin", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "instructions": "Give with food"}]',
    'Sent',
    2
);

-- Insert a sample bill
INSERT INTO bills (clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name, date, items, subtotal, tax, discount, total, status, payment_method, created_by) VALUES
(1, 'BIL-1', 1, 1, 'Max', 'John Smith', CURRENT_DATE,
'[{"description": "Consultation Fee", "quantity": 1, "price": 50.00}, {"description": "Physical Examination", "quantity": 1, "price": 30.00}, {"description": "Multivitamin (30 days)", "quantity": 1, "price": 20.00}]',
100.00, 10.00, 0.00, 110.00, 'Paid', 'Cash', 2);

-- Insert a sample prescription
INSERT INTO prescriptions (clinic_id, custom_id, visit_id, pet_id, pet_name, owner_name, date, veterinarian_id, veterinarian_name, diagnosis, medicines) VALUES
(1, 'RX-1', 1, 1, 'Max', 'John Smith', CURRENT_DATE, 2, 'Dr. Michael Chen',
'Routine wellness - preventative care',
'[{"name": "Multivitamin", "dosage": "1 tablet", "frequency": "Once daily", "duration": "30 days", "instructions": "Give with food in the morning"}]');

-- Reset sequences to start from the next available ID
SELECT setval('clinics_id_seq', (SELECT MAX(id) FROM clinics));
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('pets_id_seq', (SELECT MAX(id) FROM pets));
SELECT setval('appointments_id_seq', (SELECT MAX(id) FROM appointments));
SELECT setval('visits_id_seq', (SELECT MAX(id) FROM visits));
SELECT setval('bills_id_seq', (SELECT MAX(id) FROM bills));
SELECT setval('prescriptions_id_seq', (SELECT MAX(id) FROM prescriptions));
