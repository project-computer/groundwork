# 0014 — Backups are restorable whole-clinic documents

- Status: accepted
- Date: 2026-10-28

## Context

The Settings page promised a "native backup" but only offered a download of the
clinic document. Nothing could read that file back, so the promise was empty:
a clinic that lost its SQLite file or its browser profile had no recovery path.
The export archive is also a reporting/hand-off artifact and was never intended
to be re-imported.

## Decision

Ship one explicit backup format and a restore flow that previews before it
replaces anything.

- `lib/vet/backup.ts` owns the envelope: `{ format: 'vetcare-clinic-backup',
  version: 1, createdAt, state }`, where `state` is the same full `ClinicState`
  the app persists. A `CaseBundle` is still a single patient's shareable
  history; the two are never interchangeable.
- `parseBackup` validates the envelope **and** the payload with
  `isClinicState`, returning a human-readable reason instead of throwing.
  Foreign files, truncated JSON and unsupported versions are rejected before
  the reducer sees them.
- Restore is a destructive, audited write gated on the `data.export`
  permission. The Settings page shows a preview (clinic, counts, creation
  date) and warns when the backup belongs to a different clinic. The current
  data is only replaced after "Restore backup".
- The signed-in session survives a restore. If that member is not in the
  backup, the first active admin takes over, and the lock screen applies when
  that account has a PIN — restoring must never silently unlock a terminal.
- Export, backup creation and restore each append an audit event
  (`data.export`, `backup.create`, `backup.restore`). These entries are local
  only: they do not enter the sync outbox, because an export is not a business
  change to replay to the cloud.

## Consequences

- A backup file is the unit of disaster recovery; the export archive stays the
  unit of reporting.
- Restores are safe to attempt on the wrong file: nothing changes until the
  preview is confirmed.
- Backups contain PIN hashes, so the file is as sensitive as the installation
  itself and must be stored outside the machine.
- A future schema change must bump `version` and add a migration; older files
  will be rejected rather than partially restored.
