# Offline-MVP plan reconciliation — external plan vs this repo

- Date: 2026-11-06
- Source: external "VetCare — Technical implementation plan & engineering
  backlog" (10-epic offline-first MVP: Tauri 2 + React shell, Go sidecar
  owning SQLite via sqlc/REST, normalized 10-migration schema, cloud sync
  excluded) presented for adoption on 2026-11-06.
- Scope: documentation only — verdicts per plan section, three new ADRs
  (0020–0022), delta issues 0013–0018. No code changed in this pass.
- Status: **adopted as input, rejected as architecture.** The plan largely
  re-describes what this repo already shipped, under different vocabulary and
  a persistence model the repo explicitly moved away from (ADR 0012).
  The plan's genuinely missing ideas are captured as the deltas below.
- **Executed 2026-11-06:** deltas 1–5 landed — ADR 0020/0021/0022
  implemented with the issue docs carrying test paths. A parallel stream
  additionally adopted the plan's resource-API direction as a complete,
  self-contained `server/internal/offlineapi` package (normalized SQLite
  migrations, sqlc queries, `/api/v1` handlers with bearer sessions and the
  same per-launch secret), per the owner's "adopt old and new" call — the
  verdict table below describes the architecture verdicts, not that later
  blend.

## Part A — verdicts per plan section

| Plan section | Verdict | Where it lives today / where it lands |
| --- | --- | --- |
| §1 Offline-first scope | **conforms** | Offline is the baseline; cloud sync exists but is optional (`VET_CLOUD_URL` unset = disabled) — stricter than the plan's "exclude", not weaker |
| §2 Sidecar architecture | **conforms + 1 delta** | Sidecar, loopback-only, random port, stdout announcement, Rust shell = ADR 0010. Delta: per-launch secret → ADR 0020 / issue 0013 |
| §2 "Go owns all domain logic" | **reject** | Domain rules live in the TS reducer by design (ADR 0012); the sidecar validates, persists and syncs. Moving them to Go would break the Rust/web fallbacks for zero gain |
| §3 Monorepo layout (`services/`, `packages/`) | **reject** | ADR 0002 (single app, no packages). The plan's `features/` rule maps to `features/vet/<view>/`, already lint-enforced |
| §4 Epic 01 Foundation | **done** | Tauri shell, sidecar spawn, `/healthz`, embedded migrations, data dir. Delta: rotating logs → issue 0017; installer verified only manually → issue 0018 checklist |
| §4 Epic 02 Auth & staff | **done** | Staff PIN auth (ADR 0011), role matrix in `format.ts`, RBAC enforced in the reducer with `lastRejection` (ADR 0015). Plan's Argon2id passwords: not adopted — PIN is the accepted model |
| §4 Epic 03 Owners & patients | **done + 1 delta** | Owner entity (ADR 0016), MRN (docs/issues/0002), microchip/name/phone search, allergies/alerts. Delta: weight as history → ADR 0022 / issue 0016 |
| §4 Epic 04 Appointments | **done** | Clash policy (ADR 0013), walk-ins, waiting queue, status flow, responsive e2e |
| §4 Epic 05 Medical records | **done** | Visits with SOAP/vitals/diagnosis lists inside the clinic document (ADR 0009), audited corrections via per-commit audit events, print, medical timeline |
| §4 Epic 06 Prescriptions | **done** | Prescriptions on encounters, catalog-linked stock check with free-form fallback (reducer invariant) |
| §4 Epic 07 Billing | **done** | Invoices/payments in satang (ADR 0005), invoice numbers, refund headroom + void-with-payments invariants (audited) |
| §4 Epic 08 Settings & audit | **done** | Clinic document settings, audit collection; audit *viewer* prominence to re-verify during pilot (issue 0018 checklist) |
| §4 Epic 09 Backup & export | **done + 2 deltas** | ADR 0014 envelope + preview restore. Deltas: auto-backup schedule and pre-restore snapshot → ADR 0021 / issues 0014–0015 |
| §4 Epic 10 QA & release | **partially** | Unit/component/Go/Rust suites exist; release-gate scenarios thin → issue 0018 |
| §5 Normalized SQL schema + sqlc | **reject** | Superseded by the document model (ADRs 0009/0012). The plan's non-negotiables are all already true: WAL + FK enforcement, parameterized SQL, UTC + UUID ids (ADR 0005), integer satang, embedded versioned migrations, no blobs in rows |
| §6 REST resource API | **reject** | Surface is `GET/PUT /state` + `/sync/*` + `/healthz` (ADR 0010) — the document model needs no per-resource endpoints. Idempotency comes from entity versions, not submission tokens |
| §7 Milestones M1–M5 | **done** | The repo sits at the plan's M5; M6 (pilot) is the real remaining milestone |
| §8 Release-gate scenarios | **adopt** | Turned into the coverage table in issue 0018 |
| §9 "First 15 tickets" | **obsolete** | All fifteen are shipped or superseded |
| §10 Product decisions | **mostly done** | UUID + human MRN ✔; search fields ✔; append-oriented *financial* records ✔ (money corrects via audited refunds/voids, never silent edits); medical records are audited-edit, not append-only — accepted deviation; Thai/EN + THB ✔; single installer ✔; versioned migrations ✔ |
| §11 Vet-workflow-first priority | **agree, already the shape** | The encounter workflow is the app's centre; admin screens came second |
| §12 Next deliverables | **done here** | ADRs 0020–0022 + issues 0013–0018 are exactly the artifacts §12 asks for, scoped to the deltas |

## Part B — patient photos (PET-11), noted and deferred

The plan includes patient photos as MVP. This repo never scoped them (no
attachment collection in the clinic document; the cloud `uploads/` folder is
server-only). Deliberately deferred until a pilot clinic asks: attachments
would add a filesystem surface to back up (ADR 0014 backup is one
self-contained JSON) — revisit as its own ADR if requested.

## Part C — deltas (the only actionable output)

1. **ADR 0020 / issue 0013** — sidecar loopback secret (security hardening).
2. **ADR 0021 / issues 0014–0015** — daily auto-backup + pre-restore safety
   snapshot.
3. **ADR 0022 / issue 0016** — weight history from encounter vitals.
4. **Issue 0017** — rotating local logs.
5. **Issue 0018** — release-gate E2E coverage (the plan's §8 table).

Suggested order: 0013 → 0014 → 0015 (backup/security hardening, pilot
blockers), then 0016/0017 in parallel, 0018 last before pilot.
