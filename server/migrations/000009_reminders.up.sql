-- 000009_reminders
-- Per slices 0011 + 0012: daily dedup key + per-clinic multi-touch cadence.

ALTER TABLE notification_log
    ADD COLUMN touch_offset_days INT,
    ADD COLUMN send_date DATE;

CREATE INDEX idx_notification_log_dedup
    ON notification_log (ref_type, ref_id, touch_offset_days, send_date)
    WHERE ref_type = 'vaccination';

-- Positive = before due, 0 = on the day, negative = after due. Default cadence
-- [7, 0, -7] keeps existing clinics on the classic 3-touch reminder.
ALTER TABLE clinics
    ADD COLUMN reminder_window_days INT[] NOT NULL DEFAULT ARRAY[7, 0, -7];
