# NotificationLog + channel adapters (LINE Messaging API + SMS + Email) + owner contact fields

## What to build

Migration `000007_notifications.up.sql`:

- `notification_log (id SERIAL PK, clinic_id INT NOT NULL REFERENCES clinics(id), channel VARCHAR(10) NOT NULL CHECK (channel IN ('line', 'sms', 'email')), recipient_owner_id INT REFERENCES owners(id), recipient_user_id INT REFERENCES users(id), ref_type VARCHAR(30) NOT NULL, ref_id INT NOT NULL, status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'failed')) DEFAULT 'queued', error TEXT, external_id VARCHAR(255), attempt_count INT NOT NULL DEFAULT 0, queued_at TIMESTAMP DEFAULT NOW(), sent_at TIMESTAMP, delivered_at TIMESTAMP, CHECK ((recipient_owner_id IS NOT NULL) OR (recipient_user_id IS NOT NULL)))`.
- Add to `owners`: `preferred_channel VARCHAR(10) CHECK (preferred_channel IN ('line', 'sms', 'email'))`, `notify_opt_out BOOLEAN NOT NULL DEFAULT FALSE`, `line_user_id VARCHAR(120) UNIQUE`.

Backend:

- Define a `Notifier` interface: `Send(ctx, channel, recipient, message) (externalID string, err error)`.
- Three adapters: LINE (uses Messaging API; requires LINE OA channel access token), SMS (Twilio or Vonage), Email (SMTP). Each adapter reads its own env-var secrets (`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_OA_ID`, `SMS_API_KEY`, `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`).
- Contact resolution helper: starting from `owner.preferred_channel`, fall back to `line → sms → email` skipping any channel where the contact field is null; skip the whole send if `notify_opt_out`.
- A small CLI or endpoint (`POST /admin/notifications/test`) that takes an owner ID, composes a sample message, sends via the resolved channel, and returns the NotificationLog row.

Frontend: extend `pages/OwnerDetail.tsx` with the three contact fields + a "Send test notification" button (admin role only). Settings page for SMS/Email/LINE credential status.

## Acceptance criteria

- [ ] Migration applies; CHECK constraints enforce valid channels and the recipient invariant.
- [ ] Each adapter unit test sends and asserts a `NotificationLog` row is written with `status = 'sent'`.
- [ ] Contact resolution: an owner with `preferred_channel='line'` and no `line_user_id` falls back to `sms` if phone present; finally `email`.
- [ ] Owners with `notify_opt_out=true` are skipped entirely; the helper logs a row with `status='skipped'` OR doesn't log — pick one and document.
- [ ] LINE OA friend-add webhook is out of scope for this slice — `line_user_id` is set manually via the owner form for MVP.

## Blocked by

- Slice 0003 (owner first-class entity — `owners` table must exist with stable IDs)
- **HITL marker**: this slice requires human action to provision real LINE Messaging API credentials (LINE OA channel access token), an SMS provider account, and email SMTP credentials. Provision before integration tests can run end-to-end.

## Notes for HITL

Real-environment credentials needed before tests are meaningful:

- LINE: a LINE Official Account + a Messaging API channel; the channel access token is set in `LINE_CHANNEL_ACCESS_TOKEN` env var; the OA's basic ID in `LINE_OA_ID`.
- SMS: either Twilio (account SID + auth token + from-number) or Vonage (API key + secret + from-number/LMS sender).
- Email: an SMTP relay (e.g. Postmark, SendGrid SMTP, or a Mailgun SMTP credential); store under `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`.
- Dev fallbacks: log-only adapters that no-op send but still write the `NotificationLog` row — useful for local dev without credentials.
