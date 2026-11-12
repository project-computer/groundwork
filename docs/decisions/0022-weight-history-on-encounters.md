# 0022 — Weight history lives on encounter vitals

- Status: accepted
- Date: 2026-11-06

## Context

Patients carry a mutable `weightKg` field, and every Visit records
`vitals.weightKg`. Two sources of truth: a visit that records 28.6 kg leaves
the patient profile showing a stale number until someone edits the clinical
profile, and there is no weight history anywhere. The external MVP plan
states the requirement directly: weight should be a historical measurement,
not just a mutable field — each visit records a weight observation.

## Decision

The clinical weight record is the Visit's vitals entry. The patient-level
field demotes to the owner-reported baseline.

- New read-model selector in `lib/vet/selectors.ts`: for a patient, the
  latest recorded non-empty `vitals.weightKg`, with the encounter date.
- The patient profile and any weight-derived UI read the selector and show
  "last recorded <weight> (date)" instead of a bare mutable number.
- `patient.weightKg` / `weightUnit` keep their place on the clinical profile
  form as the **baseline** weight (owner-reported, used until the first
  visit records vitals) — relabelled, still editable, no longer presented as
  current clinical truth.
- No document-shape change: the `patients` and `encounters` collections are
  untouched, so the three shape guards (`isClinicState`, `store.Validate`,
  `validate_state`) and both migration sets are unaffected.

## Consequences

- Weight history comes free with the medical timeline — the selector is
  derived, nothing is migrated, and existing documents render correctly.
- Components must not read `patient.weightKg` for clinical display anymore;
  the selector is the single derivation (repo rule: if two places compute
  the same fact, one is a bug waiting to happen).
- Dose calculations that need a weight must use the latest vitals value;
  the baseline field is fallback only.
