# Owner promoted to first-class entity

The existing schema stores owner fields (`owner_name`, `owner_phone`, etc.) directly on each `pets` row, duplicating the same owner across multiple patients. To support linking multiple patients to one owner, per-owner visit history, and per-owner notification routing, we introduce an `owners` table with `patient.owner_id` FK, tenant-scoped via `clinic_id`.

We chose **1-to-many** (one Owner owns many Patients) over many-to-many because joint-custody cases are covered by an optional `secondary_contact` JSON field on Owner, and "pet belongs to multiple primary owners" is rare in vet practice. A future migration to a `owner_patients` join table is mechanical if the need arises.

Existing denormalized rows are migrated by deduplicating on `(owner_phone, COALESCE(owner_national_id, owner_phone))` — phone is the most stable key, national ID is often null. The `secondary_contact` field absorbs the legacy `owner_label` / secondary-phone patterns.

## Considered Options

- **M:N via join table** — rejected: ~95% of cases are 1-owner-many-pets; the join doubles auth/permission complexity (which owner is "primary" for a shared pet?).
- **Keep denormalized** — rejected: blocks per-owner communication history and per-owner reminder targeting that the requirements explicitly call out.

## Consequences

- `patients` table loses ~6 owner columns; gains `owner_id INT NOT NULL REFERENCES owners(id)`.
- Every read that previously selected owner fields now JOINs `owners`. Performance is unchanged at MVP scale.
- Backfill must run as a one-shot migration; verify row counts before/after.
