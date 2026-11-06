# Pre-restore safety snapshot (ADR 0021)

- Status: **landed 2026-11-06.** `snapshotForRestore` fail-closed flow in
  `features/vet/settings` (desktop snapshot + audit before dispatch; web
  download-first confirmation). Tests: settings `backup-restore.component.test.tsx`
  (restore disabled until safety copy, preview flow).

## What to build

The restore flow in Settings currently dispatches `restoreBackup` directly;
the previous document is replaced with no undo (ADR 0014's preview protects
against the wrong *file*, not against restore regret).

- Before dispatching `restoreBackup`, snapshot the current document through
  the persistence seam as a `pre-restore-<timestamp>` backup (sidecar
  `POST /backups`; same envelope, `trigger: 'pre-restore'`).
- If the snapshot write fails (sidecar down, disk full), abort the restore
  with a visible rejection — fail closed. A restore must never be the
  operation that loses the only copy of the data.
- Append the local-only `backup.pre_restore` audit event.
- Restore preview copy gains one line: "A safety copy of the current data
  will be saved as <file> first."
- Web fallback (no sidecar): keep today's behaviour but require an explicit
  confirmation that no safety copy exists (download prompt before replace).

The reducer action itself is unchanged — the snapshot is sequenced in the
restore flow before the dispatch, never inside the reducer.

## Acceptance criteria

- [ ] Every successful restore leaves a parseable `pre-restore-*.json` in the
      backup folder whose contents equal the pre-restore document.
- [ ] A restore with the sidecar unavailable (desktop) is refused, not
      silently completed without a snapshot.
- [ ] The pre-restore file can be restored via the existing flow (round trip).
- [ ] `backup.pre_restore` audit event recorded, local-only.
- [ ] Preview shows the safety-copy line; rejection message on failed
      snapshot is user-readable.

## Blocked by

- 0014 (needs `POST /backups` and the envelope `trigger` field).

## Status — shipped 2026-11-06

- `snapshotBeforeRestore()` in `lib/vet/backup.ts` builds a `pre-restore`
  envelope and POSTs it to the sidecar before any restore; a failed snapshot
  aborts the restore with a user-readable rejection, and the Settings flow
  previews the safety-copy line before confirming.
