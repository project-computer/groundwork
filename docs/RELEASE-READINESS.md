# Release readiness — prioritized gaps

- Date: 2026-11-07
- Baseline: `202944e` + the build-gate fix in this pass
- Scope: the external VetCare offline-MVP plan (10 epics), measured against
  the code that actually ships in `apps/clinic` and the plan-shaped backend in
  `server/internal/offlineapi`
- Status: **not release-ready.** Foundation and most workflows exist; the
  gaps below are what stands between the current build and a pilot clinic.

Status legend: `[ ]` open · `[x]` done · `[~]` partial / split across the two
stacks.

## P0 — blocks release

### P0-1. Build and typecheck gate — DONE

`pnpm build` failed on five TypeScript errors in the unused REST client, so
the Tauri `beforeBuildCommand` could not produce an installer. CI did not run
`tsc`, so the failure was invisible.

- [x] Fix `rest.ts` config narrowing, optional `withQuery`, and the missing
      `notes` / `cancellationReason` fields on `RestAppointment`.
- [x] Add `make typecheck` and a `Typecheck (TS)` CI step.
- [x] Add the typecheck to the `make ci` aggregate.
- Acceptance: `pnpm -C apps/clinic build` is green; a type error fails CI
  before the release workflow reaches `tauri build`.

Evidence: [`rest.ts`](../apps/clinic/src/lib/vet/rest.ts),
[`rest.test.ts`](../apps/clinic/src/lib/vet/__tests__/rest.test.ts),
[`Makefile`](../Makefile), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

### P0-2. First-run setup replaces the demo seed

A fresh install loads the Baan Sathorn demo clinic, demo owners/patients and
signs in as seeded veterinarian `u-pim`. There is no setup screen; a real
clinic would start by editing someone else's records.

- [ ] First launch with an empty database renders a setup flow: clinic name,
      address/contact, currency/locale/timezone, admin name, username, PIN.
- [ ] Setup writes to the authoritative store chosen in P0-4 (if that is the
      REST backend, `POST /api/v1/setup` already exists in `vetcare`), not the
      demo seed.
- [ ] No demo records are created in production builds; keep the seed behind
      an explicit dev/demo flag if it is still useful.
- [ ] Setup is blocked after initialization and is covered by a test.

Evidence: [`store.tsx`](../apps/clinic/src/lib/vet/store.tsx),
[`seed.ts`](../apps/clinic/src/lib/vet/seed.ts),
[`auth_handlers.go`](../server/internal/offlineapi/api/auth_handlers.go).

### P0-3. Real sign-in and server-enforced RBAC

In the shipping app, authorization is a TypeScript reducer check. PINs are
optional, locking is manual, and any signed-in member can use "Sign in as" on
another member. No seeded member has a PIN, so a receptionist can switch to
the admin account without a credential. The REST backend already enforces
roles, but the UI never calls it.

- [ ] All active staff have a PIN before clinic data is usable; setup creates
      the first one.
- [ ] Launch requires sign-in (the current lock screen is the starting point).
- [ ] Account switching requires the target member's PIN; no PIN-less bypass.
- [ ] Sessions have a defined TTL, logout, and re-auth on expiry.
- [ ] Every write is authorized by the Go backend, not only by React; the
      role matrix in `format.ts` becomes the client mirror of the server rule.
- [ ] Tests: receptionist is rejected by the backend on admin-only actions.

Evidence: [`member-form.tsx`](../apps/clinic/src/features/vet/staff/components/member-form.tsx),
[`lock-screen.tsx`](../apps/clinic/src/features/vet/session/components/lock-screen.tsx),
[`server.go`](../server/internal/offlineapi/api/server.go).

### P0-4. Choose one authoritative database

Two persistence models run side by side: `clinic.db` (JSON document,
`clinic-core`) is what every screen uses, and `vetcare.db` (normalized SQLite,
REST) is spawned and tested but has no callers. Until this is resolved, the
plan's "Go owns domain logic" and "one authoritative database" are not true.

- [ ] Decide: finish ADR 0023 phase 4, or remove the unused `vetcare` binary
      and `rest.ts` until the cutover actually starts.
- [ ] If finishing: run the `clinic_state` importer, cut features over one by
      one, and delete the document store + sync engine (phase 5).
- [ ] If deferring: stop spawning `vetcare`, delete the dead transport, and
      update the README/ADR status so the repo has one story.
- Acceptance: one database is written at runtime; no feature reads a store
  the other stack owns.

Evidence: [`rest.ts`](../apps/clinic/src/lib/vet/rest.ts),
[`persistence.ts`](../apps/clinic/src/lib/vet/persistence.ts),
[ADR 0023](decisions/0023-offline-mvp-normalized-architecture.md).

### P0-5. Installer verified on a clean Windows machine

The release workflow builds Windows/macOS bundles, but no clean-machine test
exists. The plan's definition of done is install → launch offline → restart →
uninstall without losing data.

- [ ] Install on a clean Windows VM with no Go/Node/Rust toolchain.
- [ ] Complete setup, register a patient, close and reopen, verify data.
- [ ] Disconnect the network for the whole run.
- [ ] Uninstall and confirm the app-data directory behaviour is documented.
- [ ] Record the steps and result in `apps/clinic/e2e/README.md`.

Evidence: [`.github/workflows/release.yml`](../.github/workflows/release.yml),
[`tauri.conf.json`](../apps/clinic/src-tauri/tauri.conf.json).

## P1 — pilot blockers

### P1-6. Printable consultation summary (MED-11)

`window.print()` exists only in the receipt dialog.

- [ ] A consultation summary prints patient identity, owner, date, vet,
      vitals, diagnosis, treatment, prescriptions and notes.
- [ ] Print styles reuse the `.print-area` discipline; no dashboard chrome.

Evidence: [`receipt-dialog.tsx`](../apps/clinic/src/features/vet/billing/components/receipt-dialog.tsx),
[`base.css`](../apps/clinic/src/styles/base.css).

### P1-7. Printable prescription (RX-05)

- [ ] One-click prescription print from an open or closed encounter, with
      clinic identity, patient/owner, medication, dose, route, frequency,
      duration, quantity and prescriber.

### P1-8. Structured clinical fields and auditable corrections

The UI encounter holds vitals, free-text notes, diagnoses and prescriptions.
The plan's chief complaint, symptoms, examination and treatment plan exist in
the normalized backend but not in the running UI. Only notes can be amended;
diagnoses can be added/confirmed but not corrected, and vitals overwrite
silently.

- [ ] Add the four clinical fields to the encounter editor and print/export.
- [ ] Diagnosis edit/correct with a reason and an audit event.
- [ ] Vitals correction keeps a trace (or explicitly justifies overwrite).
- [ ] Do not block closing a visit on billing.

Evidence: [`types.ts`](../apps/clinic/src/lib/vet/types.ts),
[`consultations/index.tsx`](../apps/clinic/src/features/vet/consultations/index.tsx),
[`0005_consultations.sql`](../server/internal/offlineapi/migrations/0005_consultations.sql).

### P1-9. Editable service catalog (BILL-01, SET-04)

The consultation fee is a hard-coded seeded product (`svc-1`); there is no UI
to add a service or change a price. Inventory items can be added, but services
are not inventory.

- [ ] Admin can create/edit/deactivate services (name, category, unit, price).
- [ ] Closing an encounter reads the configured consultation fee.
- [ ] Price changes are audited and do not rewrite historical invoices.

Evidence: [`billing/index.tsx`](../apps/clinic/src/features/vet/billing/index.tsx),
[`store.tsx`](../apps/clinic/src/lib/vet/store.tsx).

### P1-10. Owner/pet and medical-record exports (BKP-06/07)

The only CSV export is the reports spreadsheet; the JSON archive is not the
portable owner/pet or medical-record export the plan asks for.

- [ ] Owners + patients CSV.
- [ ] Medical records export (visits, diagnoses, prescriptions, vaccinations)
      in a documented, re-importable or human-readable format.
- [ ] Export is permission-gated and audited.

Evidence: [`export-csv.ts`](../apps/clinic/src/features/vet/reports/utils/export-csv.ts),
[`settings/index.tsx`](../apps/clinic/src/features/vet/settings/index.tsx).

### P1-11. Database-level backup, restore and verification (BKP-04/05)

The Settings flow restores a whole clinic document with a safety copy, which
is appropriate for the document model. The normalized backend's backup routes
store the same document envelopes, not a SQLite backup, and there is no
restore route. There is no schema/integrity verification step.

- [ ] Backup the normalized SQLite database consistently (or use `VACUUM INTO`).
- [ ] Restore into a temp location, validate schema + `PRAGMA integrity_check`,
      keep a safety copy, then swap and restart.
- [ ] Add `POST /api/v1/backups/{file}/restore` once the backend is authoritative.
- [ ] Test the failure paths (bad file, wrong clinic, interrupted restore).

Evidence: [`backups.go`](../server/internal/offlineapi/api/backups.go),
[`backup.ts`](../apps/clinic/src/lib/vet/backup.ts),
[ADR 0021](decisions/0021-scheduled-backups-and-restore-safety.md).

### P1-12. Full-visit UI E2E and the release-gate scenarios (QA-04, plan §8)

The API-level full visit is covered (`visit_e2e_test.go`); the browser suite
covers shell mounting and responsive appointment layout only. Offline, RBAC
denial, restore and restart are not automated through the UI.

- [ ] Playwright: register owner → pet → walk-in → consult → prescribe →
      invoice → partial payment → receipt → restart → data intact.
- [ ] Playwright: receptionist is denied an admin-only action.
- [ ] Playwright: restore a backup through Settings and verify history.
- [ ] Offline smoke: run the visit flow with the network disabled.
- [ ] Run `make test-pages` in CI once the suite covers the visit flow.
- [ ] Keep the manual installer + veterinarian walk-through in the release log.

Evidence: [`e2e/`](../apps/clinic/e2e),
[`visit_e2e_test.go`](../server/internal/offlineapi/api/visit_e2e_test.go),
[issue 0018](issues/0018-release-gate-e2e-coverage.md).

## P2 — completeness and polish

### P2-13. Patient photos / attachments (PET-11)

The normalized schema has `pet_attachments` metadata but no upload route or
UI. The plan lists this as MVP; the repo deliberately deferred it. Revisit
with the pilot clinic before the first real deployment.

- [ ] Store bytes on disk, metadata in SQLite, include attachments in backup.
- [ ] Upload/view/delete from the patient profile, with a size/type allow-list.

### P2-14. Appointment cancellation reason (APT-04)

The backend requires `cancellationReason` when cancelling; the UI has no field
and only flips the status.

- [ ] Prompt for a reason; persist it; show it on the appointment card and in
      the audit summary.

### P2-15. List pagination and invoice search (PET-08, BILL-09)

Owners/pets and invoices render every row; there is no invoice search.

- [ ] Server-side pagination (the REST list endpoints already accept it) or a
      documented client cap.
- [ ] Invoice search by number, owner and date range.

### P2-16. Audit viewer access (AUD-03)

The audit panel is rendered for every role in Staff & Permissions.

- [ ] Gate the audit trail on `staff.manage` (or a dedicated audit
      permission); show a read-only reason otherwise.

### P2-17. Weight trend, not just latest (ADR 0022)

`latestWeightKg` is the only derived weight view. The data already records a
measurement per visit.

- [ ] Show a small trend/history in the patient profile.
- [ ] Keep the baseline weight labelled as owner-reported.

### P2-18. User management endpoints in the REST backend (AUTH-02)

The SQL layer has `CreateUser`, `ListUsers`, `SetUserActive` and `AssignRole`,
but no `/api/v1/users` routes.

- [ ] Add list/create/update/deactivate/role routes with admin-only checks and
      audit events, if the REST backend becomes authoritative.

### P2-19. Invoice numbering is sequence-backed

The document model derives the next number from `142 + invoice count`, which
can collide after a restore or a deleted/voided history. The REST backend
already derives the next number from the stored prefix.

- [ ] Persist a per-clinic sequence (or derive from max existing number).
- [ ] Add a uniqueness test across restore and year rollover.

### P2-20. PIN policy hardening

- [ ] Optional lockout/backoff after repeated failures.
- [ ] Admin PIN reset that is audited.
- [ ] Decide whether a PIN can be cleared after it has been set.

## Verified working — do not rebuild

- Tauri 2 shell, sidecar lifecycle, per-launch loopback secret, random port.
- SQLite WAL + foreign keys, embedded migrations, rotating logs, app-data dir.
- Owners/patients with MRN, microchip and multi-field search; patient timeline.
- Appointments: calendar, queue, walk-in, check-in, reschedule, statuses.
- Consultations: vitals, diagnoses, clinical notes with amendments,
  prescriptions with stock checks; encounter close creates a draft invoice.
- Billing: invoices, VAT, partial payments, refunds, voids, printable receipt.
- Inventory: items, lots, suppliers, FEFO dispensing, stock ledger.
- Vaccinations, case transfer import/export, reports, Thai/English.
- Audit events on writes; daily + manual backups with rotation and safety copy.
- Go tests (both modules), 171 frontend unit tests, and the browser component suite.

## Suggested order

1. P0-1 (done) → P0-2 → P0-3 — a clinic can install, set up and sign in.
2. P0-4 — pick one database before building more features on either.
3. P0-5 — prove the installer while the surface is still small.
4. P1-6/7/8 — the clinical outputs a veterinarian needs daily.
5. P1-9/10/11 — money and recovery correctness.
6. P1-12 — lock the release gate with UI E2E.
7. P2 items as the pilot asks.

## Verification commands

```bash
make typecheck      # tsc --noEmit
make build          # production web build
make test-ts        # unit + component
make test-go        # Go, both modules
make test-pages     # Playwright shell/page tests
make ci             # the full CI aggregate
```
