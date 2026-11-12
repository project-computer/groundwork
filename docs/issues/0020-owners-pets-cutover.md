# Owners & pets REST cutover (ADR 0025 slices)

## What to build

Cut the registration feature over per ADR 0025 (REST-first with document
projection), slice by slice. Each slice is shippable alone; a feature is
either cut over or not.

- [x] **Slice 1 — creation (2026-11-12).** `registerOwnerAndPatient` /
      `registerPatient` in the store; the registration view calls them.
      Client-minted owner id, server MRN projected into the document;
      `restEnsureOwner` converges pre-cutover owners; unreachable REST
      degrades to a local-only commit.
- [ ] **Slice 2 — edits.** `updatePatient` / `updateOwner` PATCH through
      REST before the document projection; 404 → ensure-then-PATCH for
      pre-cutover rows.
- [ ] **Slice 3 — appointments.** Book/check-in/status transitions REST-first
      (the reducer's clash policy still validates locally before the call);
      walk-ins included.
- [ ] **Slice 4 — hydration convergence.** On boot with REST configured,
      pull owners/pets and reconcile into the document (importer semantics,
      per-entity), so reads converge after offline periods.
- [ ] **Slice 5 — encounters/prescriptions/billing.** After 2–4 prove the
      pattern; clinical writes keep the document's audit-first ordering.

## Acceptance criteria (per slice)

- [ ] With REST: the write exists in both stores under one id; the UI reads
      the projected document row.
- [ ] Without REST: the write is local-only and behaves exactly as before.
- [ ] No component imports a transport (store-orchestrated only).
- [ ] Reducer invariants still hold (clash policy, MRN uniqueness in the
      document, audit + outbox rows for local commits).

## Blocked by

- Nothing — slices are independent; 0021 (reconciliation) should land
  before relying on local-only writes surviving long offline periods.
