# Patient vocabulary cleanup — rename `pets`→`patients`, MRN, DOB, frontend alignment, dead code

## What to build

One migration that performs the rename and backfill:

- `ALTER TABLE pets RENAME TO patients;` plus rename every `pet_id` column on `appointments`, `visits`, `prescriptions`, `case_transfers`, `visit_images` to `patient_id`.
- Rename `appointments.pet_name` snapshot column to `patient_name` (cosmetic consistency).
- `ALTER TABLE patients RENAME COLUMN custom_id TO mrn;` + backfill `UPDATE patients SET mrn = 'PT-' || EXTRACT(YEAR FROM created_at)::TEXT || '-' || LPAD(id::TEXT, 4, '0') WHERE mrn IS NULL OR mrn !~ '^PT-\d{4}-\d{4}$'`.
- `ALTER TABLE patients DROP COLUMN age, ADD COLUMN date_of_birth DATE;` — nullable for unknown-age rescues.

Backend: rename `models.Pet` → `models.Patient`; rename `PetRepository` → `PatientRepository`; service + handler renames follow. MRN generation lives at the service layer (per-year format resets), not a DB sequence.

Frontend:

- Sidebar relabel: "Treatment OPD" → "Queue", "Treatment IPD" → "Visits", "Treatment History" → "Medical Records". Mobile nav identical.
- Rename route `/records` → `/medical-records` (with redirect from old URL via React Router).
- Drop `v.type === "OPD"` filter on `pages/Queue.tsx` so any draft can be queued.
- Delete `useVisitQueue` from `hooks/use-queries.ts` and `visitsApi.queue` from `lib/api.ts` (both unused; URL is unregistered).

## Acceptance criteria

- [ ] `psql \d+` (or equivalent) confirms no `pets` table and no `pet_id` column remain.
- [ ] Every patient row has an MRN matching `^PT-\d{4}-\d{4}$`.
- [ ] `grep -rn 'pet_id\|pets\b\|\bPet\b' backend/internal` returns 0 hits in model/repo/service/handler code.
- [ ] Patients page renders and lists patients; visiting `/records` redirects to `/medical-records`; Queue page shows all queued visits regardless of type.
- [ ] `visitsApi.queue` and `useVisitQueue` no longer exist.
- [ ] `date_of_birth` form widget renders on Patient edit/create.

## Blocked by

- Slice 0000 (test infrastructure)
