# Weight display derives from encounter vitals (ADR 0022)

- Status: **landed 2026-11-06.** `latestWeightKg` selector
  (`lib/vet/selectors.ts`), patient dialog relabel + "Last recorded …" hint
  (`features/vet/owners/components/patient-dialog.tsx`). Tests:
  `selectors.test.ts` (ordering incl. mixed offsets), patient-profile
  component test (hint renders from seeded vitals).

## What to build

- New selector in `lib/vet/selectors.ts`:
  `latestWeightKg(patientId): { valueKg: string; recordedAt: string } | null`
  — latest non-empty `vitals.weightKg` across the patient's encounters with
  their date. Pure and tested like the other selectors.
- Patient profile: replace the bare `weightKg` read-out with "last recorded
  <weight> (<date>)" from the selector; fall back to the baseline
  `patient.weightKg` (labelled as owner-reported baseline) when no encounter
  has recorded vitals yet.
- Clinical profile form: relabel the weight fields as baseline/owner-reported;
  no other form changes. Any weight-derived display (tables, dose hints)
  switches to the selector — components must no longer read
  `patient.weightKg` as clinical truth.
- No document-shape change: `patients` and `encounters` collections are
  untouched (ADR 0022), so no guard, fixture or migration work is triggered.

## Acceptance criteria

- [ ] Selector unit tests: empty vitals, multiple encounters (returns latest
      by date), patient with no encounters.
- [ ] Profile shows latest encounter weight + date after a visit with vitals
      recorded; shows baseline before the first visit.
- [ ] Recording new vitals updates the profile's displayed weight without
      touching the patient record (no `updatePatient` weight writes needed
      for display).
- [ ] No component outside the selector reads `patient.weightKg` for
      clinical display (grep + review).
- [ ] `make lint-ts` and the store/selector suites pass.

## Blocked by

- Nothing — independent.

## Status — shipped 2026-11-06

- `latestWeightKg(patientId, encounters)` selector (ADR 0022) derives the
  clinical weight from the newest encounter vitals; `patient.weightKg`
  remains the owner-reported baseline only. Patient profile and encounter
  views prefer the derived value; covered in `__tests__/selectors.test.ts`.
