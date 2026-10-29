# Data Model

Source of truth: the **clinic document** — one JSON blob in the `clinic_state`
table (migration 0003), validated by the Go sidecar and written atomically.
The TypeScript model lives in `apps/clinic/src/lib/vet/types.ts`; domain
vocabulary lives in `CONTEXT.md`.

## Tables

- **clinic_state** — single row (`id = 1`), `content` JSON is the whole clinic
  document (clinic settings, staff, owners, patients, appointments, encounters,
  invoices, payments, inventory, audit log, outbox). The frontend reducer owns
  the domain logic; storage just persists the committed document.
- **sync_meta** — key/value pull cursor and device identity (sidecar only,
  migration 0004). The outbox itself lives inside the clinic document.
- **schema_migrations** — applied migration versions, written by the runner.

Legacy VetDesk tables from 0002 (`patients`, `appointments`,
`medical_records`, `clinic_settings`) were dropped by 0005 once the
clinic_state document replaced them; nothing reads or writes them.

## Sync

The sync unit is an **entity** (`entityType` + `entityId`), not a table row.
Each local commit appends an outbox envelope to the document; the sidecar
pushes pending envelopes, pulls newer entities by cursor, merges
last-write-wins on `updatedAt`/`occurredAt` with `version` for merged
top-level entities, then prunes acknowledged entries.

## Backup format

`vetcare-clinic-backup` **v1** envelope (`apps/clinic/src/lib/vet/backup.ts`):
`{ format, version, createdAt, state }` where `state` is the full clinic
document. Restores are validated with `isClinicState` before replacing
anything. Distinct from a CaseBundle, which carries one Patient's selected
Visits for transfer to another clinic.
