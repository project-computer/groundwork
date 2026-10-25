DROP INDEX IF EXISTS idx_owners_line_user_id;
ALTER TABLE owners
    DROP COLUMN IF EXISTS line_user_id,
    DROP COLUMN IF EXISTS notify_opt_out,
    DROP COLUMN IF EXISTS preferred_channel;
DROP TABLE IF EXISTS notification_log;
