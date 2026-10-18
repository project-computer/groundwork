# Data Model

Source of truth: `apps/clinic/src-tauri/migrations/` (0001 → 0002).
TypeScript mirror: `apps/clinic/src/lib/types.ts` (camelCase).

Migration 0002 replaced the initial normalized schema with the VetDesk
model (see ADR 0009). Conventions: UUID text PKs, UTC ISO-8601 timestamps,
`updated_at` drives merge-on-sync (last write wins).

## Tables (0002)

- **patients** — id, name, species, breed, sex, birth_date, weight_kg,
  owner_name/phone/email (embedded owner), allergies, notes, timestamps.
- **appointments** — id, patient_id → patients (ON DELETE CASCADE),
  date_time, duration_min, reason, vet, status CHECK
  (`scheduled|checked-in|in-consult|completed|cancelled|no-show`), notes,
  checked_in_at / started_at / completed_at (stamped automatically on
  status change), record_id, timestamps. Indexes on patient, date, status.
- **medical_records** — id, patient_id → patients (CASCADE), appointment_id
  (no FK; records may outlive their appointment row), vet, date, paid,
  status CHECK (`draft|final`), **content JSON** (vitals, SOAP notes,
  prescriptions, charges, follow-up), timestamps.
- **clinic_settings** — single row (id=1), content JSON, updated_at.

## Status behavior

- `appointment_set_status` stamps `checked_in_at` when entering
  `checked-in` and `completed_at` when entering `completed` (NULL-preserving).
- Records: `draft → final`, `paid` boolean.

## Backup format

`ClinicData` JSON (version 2) exported/imported by the Sync panel;
`data_replace` wipes and reloads in one transaction, `data_merge` merges
per-entity by `updated_at` (last write wins).
