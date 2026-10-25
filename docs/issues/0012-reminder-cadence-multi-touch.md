# Reminder multi-touch cadence — 7d_before / 0d / 7d_overdue, per-clinic config

## What to build

Extend the reminder scan in `ReminderService` to support a configurable cadence:

- Add `clinics.reminder_window_days INT[]` (default `ARRAY[7, 0, -7]`) — meaning: send at `next_due_date - 7`, on the day, and 7 days after.
- For each vaccination and each `offset` in the array, scan for rows where `next_due_date + offset ∈ [today - 1, today]` (a 1-day recompute window to avoid races). For each match, dispatch a reminder tagged with the offset.
- A clinic-level UI to edit `reminder_window_days` (admin only). Default cadence stays `[7, 0, -7]` so existing clinics behave identically.

`NotificationLog` rows distinguish touch positions via a new column `touch_offset_days INT` (positive = before, zero = on the day, negative = after). Migration adds the column and the daily dedup key updates to `(vaccination_id, touch_offset_days, send_date)`.

## Acceptance criteria

- [ ] A vaccination with `next_due_date = today + 7d` produces ONE log row after today's run (touch = -7).
- [ ] A vaccination with `next_due_date = today` produces ONE log row (touch = 0).
- [ ] A vaccination with `next_due_date = today - 7d` produces ONE log row (touch = +7).
- [ ] Editing the clinic's window to `[14, 7, 0, 7]` causes exactly 4 logs to accrue across those days in a test fixture.
- [ ] Per-clinic cadence UI exposes an array editor (or 3 separate inputs for the typical case).

## Blocked by

- Slice 0011 (reminder scheduler)
