# 0021 — Scheduled automatic backups and a pre-restore safety snapshot

- Status: accepted
- Date: 2026-11-06
- Amends: 0014 (adds automation and a safety copy to the backup flow)

## Context

ADR 0014 shipped one backup format and a preview-gated restore, but creating
a backup is purely manual. A clinic that never clicks "Create backup" has no
recovery path. And a restore that goes wrong — right clinic, wrong date —
replaces the current document with no undo. The external MVP plan asks for
both: an automatic schedule, and a restore sequence that never discards the
current data before a safety copy exists.

## Decision

Both features reuse the ADR-0014 envelope and guards. No new format, no new
validation path.

- **Automatic backups.** On the first launch of each day (keyed on clinic id
  + local date, checked once after the document loads), the app builds the
  same `vetcare-clinic-backup` envelope and hands it to the sidecar, which
  writes it to `<data dir>/backups/`. Rotation keeps the most recent 14
  files; the oldest are deleted only after a successful write. Automatic
  backups are desktop-only (the sidecar owns the data directory); the web
  target keeps manual download only. They never enter the sync outbox —
  same rule as the backup audit events in ADR 0014.
- **Pre-restore snapshot.** The restore flow snapshots the *current*
  document through the persistence seam (as a
  `pre-restore-<timestamp>` backup) **before** dispatching `restoreBackup`.
  If the snapshot write fails, the restore is refused — fail closed. A
  restore must never be the operation that loses the only copy of the data.
- **Backup history.** Settings gains a list of the backup folder
  (`GET /backups` on the sidecar): date, size, trigger. Restoring from the
  list goes through the existing preview flow unchanged. The envelope gains
  one optional `trigger` field (`auto | manual | pre-restore`); `parseBackup`
  tolerates its absence so existing ADR-0014 files keep restoring.
  `version` stays 1.
- Audit events: `backup.auto` and `backup.pre_restore`, local-only like the
  other backup events.

## Consequences

- The daily trigger needs no background timer and cannot race the reducer:
  it runs on the already-loaded document, behind the same permission gate as
  manual backup (`data.export`).
- Backup-folder growth is bounded (14 files × document size); the snapshot
  adds exactly one file per restore attempt.
- "Configurable schedule" from the plan is intentionally reduced to an
  on/off toggle for the pilot — daily-at-first-launch covers the recovery
  window a single-computer clinic needs; cron-style UI is deferred until a
  clinic asks for it.
