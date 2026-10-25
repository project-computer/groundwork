# Vaccination CRUD + global vaccine_protocols lookup + auto-calc next_due_date

## What to build

Migration `000005_vaccinations_and_protocols.up.sql`:

- `vaccine_protocols (id SERIAL PK, name VARCHAR(120) NOT NULL UNIQUE, species VARCHAR(50) NOT NULL, default_interval_days INT NOT NULL, created_at)` — globally maintained, no `clinic_id`. Seed with common vaccines: Rabies (annual), DA2PP (annual), Bordetella (180d), FVRCP (annual), Feline Leukemia (annual), Leptospirosis (annual), Lyme (annual).
- `vaccinations (id SERIAL PK, clinic_id INT NOT NULL REFERENCES clinics(id), patient_id INT NOT NULL REFERENCES patients(id), visit_id INT REFERENCES visits(id), administered_by_vet_id INT REFERENCES users(id), vaccine_name VARCHAR(120) NOT NULL, manufacturer VARCHAR(120), lot_number VARCHAR(120), inventory_lot_id INT, administered_date DATE NOT NULL, next_due_date DATE, notes TEXT, created_at, updated_at)`.

Backend: `models.VaccineProtocol` (read-only), `models.Vaccination` + repo + service + handler. Service-layer logic on create: when `vaccine_name` matches a `vaccine_protocols` row, default `next_due_date = administered_date + default_interval_days`; allow per-record override. RBAC per matrix.

Frontend: `pages/Vaccinations.tsx` (list per patient with filter), `pages/VaccinationDetail.tsx`, `pages/VaccinationCreate.tsx`. Extend `pages/VisitDetail.tsx` and `pages/MedicalRecords.tsx` (timeline view) to include vaccinations alongside visits.

## Acceptance criteria

- [ ] Vaccine protocol seed exists (≥ 6 protocols).
- [ ] Creating a vaccination with a known vaccine name auto-fills `next_due_date`; override works.
- [ ] Creating a vaccination with an unknown vaccine name leaves `next_due_date` null (override-only path).
- [ ] Visit timeline shows vaccinations in order.
- [ ] `vaccine_name` is a controlled list sourced from `vaccine_protocols`, extended by admin (not user-typed free text).

## Blocked by

- Slice 0002 (patient vocabulary — stable `patient_id`)
- Slice 0004 (dashboard repo refactor — establishes the repo pattern the service follows)
