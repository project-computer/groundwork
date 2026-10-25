# Owner as first-class entity — promotion, backfill, owner pages

## What to build

Migration:

- Create `owners (id SERIAL PK, clinic_id INT NOT NULL REFERENCES clinics(id), name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), national_id VARCHAR(100), notes TEXT, secondary_contact JSONB DEFAULT '{}'::jsonb, created_at, updated_at, deleted_at)`.
- Dedup backfill: `INSERT INTO owners (clinic_id, name, phone, email, national_id, notes) SELECT DISTINCT clinic_id, owner_name, owner_phone, owner_email, owner_national_id, owner_notes FROM patients WHERE owner_phone IS NOT NULL ON CONFLICT DO NOTHING;` — then UPDATE `patients` to point at the matching `owners.id` keyed on `(clinic_id, COALESCE(phone,''), COALESCE(national_id,''))`.
- Add `patients.owner_id INT NOT NULL REFERENCES owners(id)` after backfill.
- Drop denormalized columns: `owner_name`, `owner_phone`, `owner_email`, `owner_national_id`, `owner_notes`, `owner_label` (or absorb `owner_label` into `secondary_contact` JSON).

Backend: `models.Owner` + repository + service + handler. Updates to patient handlers to read owner via JOIN (no more select of `owner_*` from patients). Owner list/detail/create/edit endpoints per RBAC matrix.

Frontend: `pages/Owners.tsx` (list, search by name/phone), `pages/OwnerDetail.tsx` (lists their patients, visit history timeline), edit/create forms. Adjust `pages/Patients.tsx` to show linked owner instead of inline fields.

Per ADR-0001, cardinality is **1-to-many**; the `secondary_contact` JSON slot handles joint-custody cases without a join table.

## Acceptance criteria

- [ ] `owners` table exists with rows ≥ the previous unique owner count.
- [ ] Every `patients.owner_id` is non-null and references the correct `owners.id`.
- [ ] The six old `owner_*` columns are gone from `patients`.
- [ ] Patient pages render owner info via the new relation; verification spot-check on 3 patients matches the legacy data.
- [ ] Owner list page + detail page render; detail lists the owner's patients.
- [ ] Smoke test covers the dedup SQL against a small fixture.

## Blocked by

- Slice 0002 (patient vocabulary — needs `patients.owner_id` to coexist with stable IDs)
