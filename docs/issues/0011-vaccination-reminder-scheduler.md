# Vaccination reminder scheduler — daily cron + manual trigger

## What to build

Backend: a `ReminderService` with two entry points:

- `RunOnce(ctx, clinicID)` — scans `vaccinations` for any row where `next_due_date - today ∈ reminder_window` (default `[7, 0, -7]`, configurable per-clinic; see slice 0012). For each match, build the message ("Your pet <name> is due for <vaccine> on <date>") and dispatch via the existing `Notifier` interface (slice 0010). Each attempt writes a `NotificationLog` row with `ref_type='vaccination'`, `ref_id=...`. Idempotent: if a log row for `(vaccination_id, touch_offset, day_bucket)` already exists, skip.
- An HTTP endpoint `POST /admin/reminders/run` (admin role only) that calls `RunOnce`. Used as a manual override button.

A scheduler binary or goroutine wraps `RunOnce` on a daily timer (8am clinic local; timezone defaults to `Asia/Bangkok` for MVP given the Thai UI). The goroutine lives in a separate `cmd/reminder/main.go` binary, deployed as its own container alongside the API.

Frontend: a "Run reminders now" button on the dashboard's "Vaccinations Due" card.

## Acceptance criteria

- [ ] Inserting a vaccination with `next_due_date = today`, calling `RunOnce` produces a `NotificationLog` row with `status='sent'` (or whatever the adapter returned) and `ref_type='vaccination'`.
- [ ] Calling `RunOnce` twice on the same day does NOT produce duplicate log rows.
- [ ] Vaccination linked to an owner with `notify_opt_out=true` produces no log row.
- [ ] Manual trigger endpoint requires admin role; receptionist/vet get 403.
- [ ] Scheduler binary runs independently from the API container.

## Blocked by

- Slice 0005 (vaccination CRUD — vaccinations must exist)
- Slice 0010 (channel adapters — `Notifier` must exist)
