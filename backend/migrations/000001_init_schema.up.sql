-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- users: Clinic staff with role-based access
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'veterinarian', 'receptionist', 'pharmacist')),
    phone VARCHAR(50),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- clinics: Multi-clinic support
CREATE TABLE clinics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- pets: Core patient entity
CREATE TABLE pets (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    species VARCHAR(50) NOT NULL,
    breed VARCHAR(255),
    age DECIMAL(4,1),
    weight DECIMAL(6,2),
    owner_name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50) NOT NULL,
    owner_email VARCHAR(255),
    owner_national_id VARCHAR(100),
    owner_notes TEXT,
    owner_label VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Deceased')),
    last_appointment_date DATE,
    next_appointment_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- appointments: Scheduling
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    pet_id INT REFERENCES pets(id),
    pet_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Scheduled',
    notes TEXT,
    veterinarian_id INT REFERENCES users(id),
    veterinarian_name VARCHAR(255),
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- visits: Core workflow entity
CREATE TABLE visits (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    pet_id INT REFERENCES pets(id),
    appointment_id INT REFERENCES appointments(id),
    pet_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('OPD', 'IPD')),
    purpose VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Draft',
    assigned_vet_id INT REFERENCES users(id),
    assigned_vet_name VARCHAR(255),
    steps JSONB DEFAULT '{}',
    chief_complaint TEXT,
    vitals JSONB DEFAULT '{}',
    examination TEXT,
    differential_diagnosis TEXT,
    final_diagnosis TEXT,
    treatment TEXT,
    advice TEXT,
    follow_up_date DATE,
    medications JSONB DEFAULT '[]',
    has_medication_envelope BOOLEAN DEFAULT false,
    history_notes TEXT,
    billing_status VARCHAR(50) DEFAULT 'Not Sent',
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- visit_images: Image uploads for visits
CREATE TABLE visit_images (
    id SERIAL PRIMARY KEY,
    visit_id INT REFERENCES visits(id) ON DELETE CASCADE,
    file_key VARCHAR(500) NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    caption TEXT,
    file_size INT,
    mime_type VARCHAR(100),
    uploaded_by INT REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- bills: Invoicing
CREATE TABLE bills (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    visit_id INT REFERENCES visits(id),
    pet_id INT REFERENCES pets(id),
    pet_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    subtotal DECIMAL(10,2) NOT NULL,
    tax DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending',
    payment_method VARCHAR(50),
    payment_notes TEXT,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- prescriptions: Rx records
CREATE TABLE prescriptions (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    visit_id INT REFERENCES visits(id),
    pet_id INT REFERENCES pets(id),
    pet_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    veterinarian_id INT REFERENCES users(id),
    veterinarian_name VARCHAR(255),
    diagnosis TEXT,
    medicines JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- opd_records: Outpatient records
CREATE TABLE opd_records (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    source_visit_id INT REFERENCES visits(id),
    pet_id INT REFERENCES pets(id),
    pet_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    veterinarian_id INT REFERENCES users(id),
    veterinarian_name VARCHAR(255),
    chief_complaint TEXT,
    vitals JSONB DEFAULT '{}',
    examination TEXT,
    diagnosis TEXT,
    treatment TEXT,
    advice TEXT,
    follow_up_date DATE,
    status VARCHAR(50) DEFAULT 'Ongoing',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ipd_records: Inpatient records
CREATE TABLE ipd_records (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    source_visit_id INT REFERENCES visits(id),
    pet_id INT REFERENCES pets(id),
    pet_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    admission_date DATE NOT NULL,
    discharge_date DATE,
    ward VARCHAR(100),
    bed_number VARCHAR(50),
    veterinarian_id INT REFERENCES users(id),
    veterinarian_name VARCHAR(255),
    reason_for_admission TEXT,
    diagnosis_on_admission TEXT,
    treatment_plan TEXT,
    daily_notes JSONB DEFAULT '[]',
    discharge_summary TEXT,
    status VARCHAR(50) DEFAULT 'Admitted',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- audit_logs: Track all changes for compliance
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    user_id INT REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id INT,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_pets_clinic_id ON pets(clinic_id);
CREATE INDEX idx_pets_owner_phone ON pets(owner_phone);
CREATE INDEX idx_pets_custom_id ON pets(custom_id);
CREATE INDEX idx_pets_deleted_at ON pets(deleted_at);
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_vet_id ON appointments(veterinarian_id);
CREATE INDEX idx_appointments_clinic_id ON appointments(clinic_id);
CREATE INDEX idx_visits_status ON visits(status);
CREATE INDEX idx_visits_pet_id ON visits(pet_id);
CREATE INDEX idx_visits_clinic_id ON visits(clinic_id);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_clinic_id ON bills(clinic_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_visit_images_visit_id ON visit_images(visit_id);
CREATE INDEX idx_prescriptions_visit_id ON prescriptions(visit_id);
CREATE INDEX idx_opd_records_pet_id ON opd_records(pet_id);
CREATE INDEX idx_ipd_records_pet_id ON ipd_records(pet_id);
