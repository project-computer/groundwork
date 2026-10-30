# Repo Structure Reference — VetCare

## Where code lives

```
apps/clinic/                  Tauri 2 + React + TS desktop app
├── src/
│   ├── app/App.tsx           root component
│   ├── components/
│   │   ├── ui/               Base UI primitives (button, card, input, tabs…)
│   │   └── vet/fields.tsx    shared vet form fields
│   ├── features/vet/         folder per View — shell/, dashboard/, owners/,
│   │                         consultations/, billing/, inventory/, records/,
│   │                         schedule/, reports/, staff/, settings/,
│   │                         workspace/ — dialogs and component tests
│   │                         beside their View; lock-screen, pin-dialog,
│   │                         language-toggle, save-error-banner and
│   │                         error-boundary stay top-level
│   ├── lib/
│   │   ├── vet/              domain: store.tsx (reducer + hooks), types.ts,
│   │   │                     backend.ts (sidecar HTTP), auth, backup, format,
│   │   │                     schedule, case-transfer, seed + unit tests
│   │   ├── i18n.tsx          lingui wrapper
│   │   └── theme.ts · utils.ts
│   ├── platform/index.ts     isTauri() — persistence layer only
│   ├── locales/              compiled lingui catalogs
│   └── test/setup.ts
├── e2e/pages/                Playwright page tests
├── src-tauri/                Rust shell
│   ├── src/                  lib.rs (sidecar spawn), db.rs (runner), clinic.rs
│   │                         (fallback commands), tests/clinic_state.rs
│   └── migrations/           0001–0003, 0005 (shared, byte-identical to sidecar)
└── .oxlintrc.json            lint + layering enforcement

apps/sidecar/                 Go clinic-core: local SQLite + sync engine
├── cmd/clinic-core/          entrypoint (loopback HTTP, announces port)
├── internal/
│   ├── api/                  GET/PUT /state · POST /sync/run · /healthz
│   ├── store/                document Validate + persistence
│   ├── sync/                 engine · entities (registry) · merge · client
│   └── db/                   SQLite open + migration runner (discovers *.sql)
├── migrations/               0001–0005 (0004 sync_meta is sidecar-only)
└── scripts/build-sidecar.sh  → bin/clinic-core (bundled by Tauri)

backend/                      Go cloud API (Fiber + Postgres), sync only
├── cmd/api · cmd/reminder
├── internal/
│   ├── handlers/ · services/ · repository/   (~18 each, three-tier)
│   ├── models/ · middleware/ · utils/ · notifications/
│   └── service/sync_service.go               entity registry (2nd copy)
└── migrations/               000001–000011 (cloud schema)

docs/                         architecture.md · data-model.md
├── decisions/                ADRs 0001–0013
├── adr/                      ADRs 0001–0004
└── plans/                    point-in-time plans (historical record)
```

## CSS layout

`src/index.css` is a short import list; **the import order is the cascade
order — keep it stable**. Partials live in `src/styles/`:

| File | Contents |
|---|---|
| `base.css` | Tailwind `@theme`, shadcn tokens, Vettera palette, element resets, the global `@media print` block (receipt `.print-area`) |
| `shell.css` | app shell, nav, panels, buttons, tables, forms, modals |
| `schedule.css` | calendar, week grid, walk-in form |
| `workspace.css` | workspace dialog, role matrix, lock screen |
| `records.css` | records/billing/staff/inventory tables (+ reports mobile seg/stat hooks) |

Two palettes coexist in `base.css` (shadcn oklch + Vettera hex); the Vettera
block owns `--sidebar-border`. Merge happens per-view during the Tailwind
migration — new UI should use Tailwind utilities with token classes
(`bg-primary`), not new semantic classes.

## Target deltas (in-flight refactoring candidates)

Plan of record: `docs/plans/2026-10-29-frontend-refactor.md`. Each phase
marks its delta **done** in the same PR that lands it — these docs never
trail the code they describe.

- Document shape: **done** — `fixtures/clinic-document.json` + conformance
  tests pin TS, Go and Rust guards; `parseClinicState` normalises legacy docs.
- Sync entity registry: **done** — `fixtures/sync-entities.json` pins
  `entities.go` (sidecar) and `sync_service.go` (backend).
- `src/lib/vet/persistence.ts` — **done**: owns `loadState`/`saveState`, the
  three adapters (sidecar HTTP, Rust invoke, localStorage), the fallback
  order, the plan preference, and the shape guards. Drift: `store.tsx` now
  imports `runSync` from `backend.ts` — the sync seam delta below restores
  the zero-transport claim.
- `features/vet/` — **done**: clinic-shell.tsx (2,768 lines, 10 components)
  dissolved into folder-per-View modules — shell/, dashboard/, owners/,
  consultations/, billing/, inventory/, records/, schedule/, reports/,
  staff/, settings/, workspace/ — with dialogs and tests beside. StaffView
  and TeamPanel are colocated in staff/ (deep dedup of their shared member
  form is still open). pet→patient / encounter→Visit renames rode the
  moves; CSS `pet-*` classes remain for the phase 6 sweep.
- Write-path invariants enforced in the reducer — **done (ADR-0015)**:
  stock floor in `addPrescription` (inventory items only; free-text meds
  pass), `recordPayment` computes the paid flip from the ledger and rejects
  overpayments (action no longer takes `settles`), refund headroom and void
  netting single-sourced, rejections surfaced via `session.lastRejection`
  (code + message, rendered by shell/rejection-banner.tsx), and one role
  matrix — `format.can()` — behind both the reducer and `usePermission`
  (veterinarian no longer holds inventory.write).
- Read model — **planned (phase 3)**: `lib/vet/catalog.ts` (prescribable/
  billable items) + `lib/vet/selectors.ts` (outstanding balance, overdue
  vaccinations, low stock — one home each) + `lib/vet/report.ts`
  (translation-free, leaves the view file).
- Deep UI primitives — **planned (phase 4)**: `components/ui/modal|data-table|
  stat-card` replace 9 hand-rolled dialogs, 6 tables, 3 stat cards
  (per decision 0008).
- `lib/vet/sync.ts` seam — **done**: useSyncWorker owns the debounced push,
  periodic pull, connectivity reset and in-flight mutation lock; the
  ClinicProvider consumes it. store.tsx imports no transport (oxlint now
  denies @/lib/vet/backend there); backend.ts has interface tests.
- Sidecar `store.Validate` becomes the single document validator — partially
  superseded: the three guards are now aligned and fixture-pinned; full
  consolidation behind the sidecar remains optional.

## Known debt (checked, deliberate)

- oxlint warnings (~30: array sort mutation, function scoping, hook deps,
  render purity) are advisory; `pnpm -C apps/clinic lint:strict` blocks on
  them. Burn them down file-by-file; don't let new ones land.
- knip warns on unused exports — fix when touching the file.
- Migration 0005 skips version 4 on the Rust side (sidecar-only 0004);
  intentional, don't "fix" the gap.
