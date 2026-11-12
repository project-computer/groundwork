# Scheduled automatic backups with rotation (ADR 0021)

- Status: **landed 2026-11-06.** Endpoints + rotation
  (`internal/api/backups.go`), envelope `trigger` + once-per-day gate +
  desktop orchestration (`lib/vet/backup.ts`), clinic toggle + history UI
  (`features/vet/settings`), launch hook (`lib/vet/store.tsx`). Tests:
  `backups_test.go` (round trip, rotation, foreign bodies, traversal),
  `backup.test.ts` (trigger tolerance, shouldAutoBackup),
  `backend.test.ts` (file transports), settings component tests (toggle
  RBAC).

## What to build

Sidecar (`apps/sidecar`):

- `POST /backups` — persist a posted `vetcare-clinic-backup` envelope to
  `<data dir>/backups/<timestamp>-<trigger>.json`; rotate: keep the most
  recent 14 files, delete older only after a successful write.
- `GET /backups` — list `{ file, createdAt, sizeBytes, trigger }` entries.
- `GET /backups/{file}` — return one envelope (for Settings preview +
  restore via the existing `parseBackup` path).
- Route access inherits the ADR-0020 secret requirement.

Envelope (`lib/vet/backup.ts`):

- Optional `trigger: 'auto' | 'manual' | 'pre-restore'` on the envelope;
  `parseBackup` tolerates its absence (ADR-0014 files keep restoring).
  `version` stays 1; update the fixture-driven guards per the repo rule —
  envelope change documented, tests updated in the same change.

Store flow (`lib/vet`):

- After the document loads at launch, if no `backup.auto` audit event exists
  for (clinic id + today's local date), build the envelope and POST it;
  append a local-only `backup.auto` audit event. Runs behind the same
  `data.export` permission gate as manual backup. Desktop only — the web
  target keeps manual download (guard on `isTauri` + sidecar availability).
- Settings: an on/off toggle (persisted in the clinic document's settings),
  default on.

## Acceptance criteria

- [ ] First launch of a day creates exactly one auto backup; relaunching the
      same day creates no second one; next day creates another.
- [ ] Files land in `<data dir>/backups/` and parse with `parseBackup`.
- [ ] Rotation caps the folder at 14 files; deletion never happens before
      the new write succeeds.
- [ ] Auto backups do not enter the sync outbox.
- [ ] Toggle off stops auto backups; on resumes them the next day.
- [ ] Settings shows the backup history (date, size, trigger) and restoring
      from it goes through the existing preview + permission flow.
- [ ] `backup.auto` audit event recorded; unit tests cover the once-per-day
      key and the rotation order.

## Blocked by

- 0013 (loopback secret) for the new routes' auth, though the routes can be
  built first and gated when 0013 lands.

## Status — shipped 2026-11-06

- Sidecar: `POST/GET /backups`, `GET /backups/{file}` with server-side
  filenames, `pre-restore`/`auto`/`manual` trigger allowlist, keep-14
  rotation after successful writes (`internal/api/backups.go`, covered by
  `backups_test.go`).
- Envelope: optional `trigger` on the ADR-0014 envelope, tolerated absent;
  `buildBackup(state, createdAt, trigger)` in `lib/vet/backup.ts`.
- Store flow: once-per-day auto backup after hydration, gated on the
  `clinic.autoBackup` setting (Settings toggle, default on) and desktop-only.
- Settings: backup history list with trigger badges and open-folder path.
