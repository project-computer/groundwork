-- case_transfers: Referral/case transfer between clinics
CREATE TABLE case_transfers (
    id SERIAL PRIMARY KEY,
    clinic_id INT REFERENCES clinics(id),
    custom_id VARCHAR(50) UNIQUE NOT NULL,
    pet_id INT REFERENCES pets(id),
    source_visit_id INT REFERENCES visits(id),
    pet_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50),
    referral_clinic_name VARCHAR(255) NOT NULL,
    referral_reason TEXT NOT NULL,
    transfer_data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received')),
    share_token UUID UNIQUE DEFAULT uuid_generate_v4(),
    expires_at TIMESTAMP,
    created_by INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transfers_clinic_id ON case_transfers(clinic_id);
CREATE INDEX idx_transfers_pet_id ON case_transfers(pet_id);
CREATE INDEX idx_transfers_status ON case_transfers(status);
CREATE INDEX idx_transfers_share_token ON case_transfers(share_token);
