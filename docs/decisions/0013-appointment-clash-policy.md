# 0013 — Appointment clashes warn and require an explicit override

- Status: accepted
- Date: 2026-10-28

## Context

The calendar let any number of appointments land on the same veterinarian at
the same time, silently. Front desks do double-book on purpose (emergencies,
two patients sharing one vet for a quick recheck), so a hard rejection would
push staff to invent workarounds — but an unnoticed clash is how a vet ends up
with two patients at 10:00.

## Decision

Treat overlapping appointments for the same veterinarian as a **warning the user
must acknowledge**, never a silent save and never a hard block.

- `lib/vet/schedule.ts` owns the rule: two slots clash when they overlap for
  the same `vetId` and both still occupy time (`booked`, `checked_in`,
  `in_consult`). Adjacent slots, cancelled/completed/no-show appointments and
  other vets never clash.
- The booking dialog shows the clashing patient, reason and time, and keeps the
  primary action disabled until "Book anyway" is checked.
- Dragging an appointment onto an occupied slot does not save; it opens the
  reschedule dialog with that time and the same warning, so the drop is never
  applied silently.
- Past-dated bookings are allowed (records get entered late) and only get a
  hint, not a warning.

## Consequences

- Staff keep full control while the risk is visible at the moment of saving.
- The rule lives in one pure module, unit-tested independently of the calendar,
  and can later grow into availability/working-hours checks.
- Walk-ins are exempt because they start at the current time and are queued
  rather than scheduled.
