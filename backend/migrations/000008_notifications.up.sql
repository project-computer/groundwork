-- 000008_notifications
-- Per slice 0010: notification_log + owner contact/preference fields.

CREATE TABLE notification_log (
    id SERIAL PRIMARY KEY,
    clinic_id INT NOT NULL REFERENCES clinics(id),
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('line', 'sms', 'email')),
    recipient_owner_id INT REFERENCES owners(id),
    recipient_user_id INT REFERENCES users(id),
    ref_type VARCHAR(30) NOT NULL,
    ref_id INT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed')) DEFAULT 'queued',
    error TEXT,
    external_id VARCHAR(255),
    attempt_count INT NOT NULL DEFAULT 0,
    queued_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    CHECK ((recipient_owner_id IS NOT NULL) OR (recipient_user_id IS NOT NULL))
);

CREATE INDEX idx_notification_log_clinic_id ON notification_log(clinic_id);
CREATE INDEX idx_notification_log_owner_id  ON notification_log(recipient_owner_id);
CREATE INDEX idx_notification_log_ref       ON notification_log(ref_type, ref_id);

ALTER TABLE owners
    ADD COLUMN preferred_channel VARCHAR(10) CHECK (preferred_channel IN ('line', 'sms', 'email')),
    ADD COLUMN notify_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN line_user_id VARCHAR(120);

CREATE UNIQUE INDEX idx_owners_line_user_id ON owners(line_user_id) WHERE line_user_id IS NOT NULL;
