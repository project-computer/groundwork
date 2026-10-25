DROP INDEX IF EXISTS idx_notification_log_dedup;
ALTER TABLE notification_log
    DROP COLUMN IF EXISTS touch_offset_days,
    DROP COLUMN IF EXISTS send_date;
ALTER TABLE clinics
    DROP COLUMN IF EXISTS reminder_window_days;
