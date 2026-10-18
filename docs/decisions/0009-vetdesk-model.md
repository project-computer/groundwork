# 0009 — Adopted the VetDesk UI model (supersedes 0004/0005 partially)

- Status: accepted
- Date: 2026-10-17

## Context

A complete, field-tested UI (`vet-management-system/`, Next.js) was ported
into the app. Its data model (Patient with embedded owner, richer Appointment
statuses incl. `in-consult`, SOAP MedicalRecord, ClinicSettings) is the
product spec now. The prior abstract owner/pet/visit schema (ADR 0004/0005
era) never had real users or data.

## Decision

- UI: shadcn (base-nova on `@base-ui/react`) + Tailwind tokens replace the
  hand-rolled kit.
- Model: VetDesk types in `src/lib/types.ts` are the app's domain model.
- Persistence: SQLite via migration 0002 — typed columns for patients and
  appointments (FK CASCADE, status CHECKs), JSON `content` for medical
  records (SOAP/prescriptions/charges) and settings.
- Store: `src/lib/store.ts` keeps the original API; Tauri backend calls
  Rust commands (source of truth), web fallback uses localStorage.

## Consequences

- Integer-minor-units money rule (ADR 0005) is relaxed: charges use plain
  numbers matching the VetDesk UI. Revisit before charging real money.
- Embedded owner-per-patient duplicates owner data across pets — accepted
  for small clinics; merge-by-updatedAt keeps sync consistent.
- Old migrations remain (0001→0002 drops and rebuilds tables); production
  data did not exist at cutover.
