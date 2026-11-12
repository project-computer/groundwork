# 0023 — Adopt the offline-MVP normalized backend

- Status: accepted
- Date: 2026-11-06
- Supersedes: 0012 (the full clinic document as source of truth)
- Amends: 0010 (the sidecar owns desktop persistence)

## Context

ADR 0012 made a single `ClinicState` JSON document the source of truth and
pushed it to the sidecar as a projection. That kept the app working while the
domain grew, but it left several problems the owner has now chosen to fix by
adopting the external offline-MVP plan literally:

- The document is opaque to SQL: no constraints, no joins, no reports, no
  per-resource pagination, and a full-document rewrite on every commit.
- Domain rules live only in the TypeScript reducer, so the Go side cannot
  enforce them (the plan's "Go handles all domain logic").
- The plan's REST surface (`/api/v1/owners`, `/pets`, `/appointments`, …) has
  no analogue; the sidecar exposes `GET/PUT /state` and `/sync/*`.

The earlier reconciliation rejected the plan's architecture. The owner has
overruled that: the plan is now the target, not an input to negotiate.

## Decision

Adopt the plan's persistence and API model for the desktop backend:

- **One normalized SQLite database**, owned by the Go service built from
  `server/cmd/vetcare` (package `server/internal/offlineapi/`), with the
  plan's ten migrations (clinics/users/roles → owners/pets →
  weights/attachments → appointments → consultations → prescriptions →
  services/invoices → payments → audit → settings). The backend lives inside
  the existing `server` module — no separate `services/` tree — and runs as a
  second loopback process beside the legacy sidecar during the transition.
- **sqlc** generates the typed data layer from `db/queries/`.
- A **resource-oriented REST API** under `/api/v1/` replaces `GET/PUT /state`
  and the sync endpoints.
- **Cloud sync is dropped from the desktop product**; `VET_CLOUD_URL` and
  `server/` are no longer part of the offline MVP path.
- The **Go service enforces auth and authorization**. The frontend is a
  client, not the rule engine.
- Tauri continues to spawn the Go binary on loopback with the per-launch
  secret from ADR 0020.

## Migration strategy

The existing app must not lose data mid-flight. Phases are cut vertically:

1. New service, full schema, sqlc, health/auth/owners/pets (this pass).
2. Appointments, consultations, prescriptions.
3. Billing, settings, audit, backups.
4. Frontend cutover from the document reducer to the REST client, feature by
   feature. Before cutover, a one-shot importer converts the existing
   `clinic_state` document into the normalized tables.
5. Remove the document store, sync engine, and `server/` from the desktop
   path once no feature reads them.

Phases 1–3 can ship without touching the UI. Phase 4 is the irreversible one
and is gated on the importer and an end-to-end visit test.

## Consequences

- ADR 0009 (VetDesk document model), the document-shape invariants in the
  `repo-structure` skill, and `fixtures/clinic-document.json` describe the
  legacy model and will be retired at cutover. Until then they still describe
  the running app; do not delete them early.
- ADR 0005 (integer satang, UTC timestamps) and ADR 0020 (loopback secret)
  continue to apply.
- Thai/English catalogs and the existing UI shell are unaffected.
- The plan's `/state`, sqlc and REST decisions are now binding; new backend
  work goes in `server/internal/offlineapi/`, not `apps/sidecar/`.

## Amendment (2026-11-06, layout)

The plan's `services/api` scaffold was folded into the existing `server`
module instead (`server/internal/offlineapi/` + `server/cmd/vetcare`), per the
owner's direction to adopt the plan's content without adopting its folder
structure: no new top-level tree, `apps/clinic` keeps its name (no
`apps/desktop` rename), and the document-model sidecar keeps running until
the phase-4 importer and cutover. The offline REST binary writes its own
`vetcare.db` so both models coexist on disk; the Tauri shell still launches
`clinic-core` only.
