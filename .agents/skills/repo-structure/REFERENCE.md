# Repo Structure Reference — VetCare

## Where code lives

```
apps/clinic/                  Tauri 2 + React + TS desktop app
├── src/
│   ├── app/                    App.tsx (root) + error-boundary.tsx — composition
│   ├── components/
│   │   ├── ui/                 Base UI primitives (button, card, input, tabs…)
│   │   └── patterns/           clinic shells + fields: modal.tsx (the one
│   │                           dialog shell), data-table.tsx (DataTable +
│   │                           StatCard), fields.tsx, date-picker.tsx,
│   │                           save-error-banner.tsx
│   ├── features/vet/           folder per View — shell/, dashboard/, owners/,
│   │                           consultations/, billing/, inventory/, records/,
│   │                           schedule/, reports/, staff/, settings/,
│   │                           workspace/, session/ — each View keeps
│   │                           `components/` for its parts (dialogs, panels,
│   │                           feature utils), `index.tsx` exports only the
│   │                           View, `*.component.test.tsx` at the View
│   │                           root; session/ holds lock-screen, pin-dialog,
│   │                           language-toggle behind its barrel
│   ├── lib/
│   │   ├── vet/              domain: store.tsx (reducer + hooks), types.ts,
│   │   │                     sync.ts (useSyncWorker), persistence.ts (the
│   │   │                     I/O seam), backend.ts (sidecar HTTP), auth,
│   │   │                     backup, format, schedule, report, worklist,
│   │   │                     catalog, selectors, case-transfer, seed + unit
│   │   │                     tests
│   │   ├── platform/index.ts   isTauri() — persistence layer only
│   │   ├── i18n.tsx          lingui wrapper
│   │   └── theme.ts · utils.ts
│   ├── locales/              compiled lingui catalogs
│   └── test/setup.ts
├── e2e/pages/                Playwright page tests
├── src-tauri/                Rust shell
│   ├── src/                  lib.rs (sidecar spawn), db.rs (runner), clinic.rs
│   │                         (fallback commands), tests/clinic_state.rs
│   └── migrations/           0001–0003, 0005 (shared, byte-identical to sidecar)
└── .oxlintrc.json            lint + layering enforcement

apps/landing/                 Public download page (React + Vite + TS)
├── src/
│   ├── app/App.tsx           page composition (hero, products, downloads, features)
│   ├── components/landing/   download-card · theme-toggle ·
│   │                         language-toggle · icons (inline, no lucide)
│   ├── lib/
│   │   ├── downloads.ts      release manifest + detectPlatform (+ tests)
│   │   ├── i18n.tsx          lingui wrapper, same `vet.locale` key as clinic
│   │   └── theme.ts          same `clinicbook:theme` key as clinic
│   └── styles/landing.css    Vettera tokens copied from clinic base.css —
│                             keep in sync; clinic is the source of truth
├── src/locales/{en,th}/      lingui catalogs (`pnpm i18n:extract/compile`)
└── .oxlintrc.json            same func-style rules as clinic

apps/sidecar/                 Go clinic-core: local SQLite + sync engine
├── cmd/clinic-core/          entrypoint (loopback HTTP, announces port)
├── internal/
│   ├── api/                  GET/PUT /state · POST /sync/run · /healthz
│   ├── store/                document Validate + persistence
│   ├── sync/                 engine · entities (registry) · merge · client
│   └── db/                   SQLite open + migration runner (discovers *.sql)
├── migrations/               0001–0005 (0004 sync_meta is sidecar-only)
└── bin/clinic-core           build output; staged by the root Makefile

server/                       Go cloud API (Fiber + Postgres), sync only
├── cmd/api · cmd/reminder
├── internal/
│   ├── handlers/ · service/ · repository/     (~18 each, three-tier)
│   ├── models/ · middleware/ · utils/ · notifications/
│   └── service/sync_service.go               entity registry (2nd copy)
└── migrations/               000001–000011 (cloud schema)

docs/                         architecture.md · data-model.md
├── decisions/                ADRs 0001–0019 (single series; 0016–0019 are
│                             domain-model ADRs renumbered from the old docs/adr/)
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

Plan of record: `docs/plans/2026-10-31-folder-structure-alignment.md`
(docs-only for clinic — the mapping section below — plus the reusable
scaffold playbook for future frontends). Predecessors, both executed:
`2026-10-30-architecture-alignment.md` and
`2026-10-29-frontend-refactor.md`. Each phase marks its delta **done** in
the same PR that lands it — these docs never trail the code they describe.

- Document shape: **done** — `fixtures/clinic-document.json` + conformance
  tests pin TS, Go and Rust guards; `parseClinicState` normalises legacy docs.
- Sync entity registry: **done** — `fixtures/sync-entities.json` pins
  `entities.go` (sidecar) and `sync_service.go` (server).
- `src/lib/vet/persistence.ts` — **done**: owns `loadState`/`saveState`, the
  three adapters (sidecar HTTP, Rust invoke, localStorage), the fallback
  order, the plan preference, and the shape guards. Drift: `store.tsx` now
  imports `runSync` from `backend.ts` — the sync seam delta below restores
  the zero-transport claim.
- `features/vet/` — **done**: clinic-shell.tsx (2,768 lines, 10 components)
  dissolved into folder-per-View modules — shell/, dashboard/, owners/,
  consultations/, billing/, inventory/, records/, schedule/, reports/,
  staff/, settings/, workspace/ — with dialogs and tests beside. StaffView
  and TeamPanel are colocated in staff/ and share their member form and row
  actions (member-form.tsx / member-row-actions.tsx, 2026-10-30 phase B).
  pet→patient / encounter→Visit renames rode the
  moves; CSS `pet-*` classes became `patient-*`/`member-avatar` (phase 6
  sweep, screenshots unchanged).
- Write-path invariants enforced in the reducer — **done (ADR-0015)**:
  stock floor in `addPrescription` (inventory items only; free-text meds
  pass), `recordPayment` computes the paid flip from the ledger and rejects
  overpayments (action no longer takes `settles`), refund headroom and void
  netting single-sourced, rejections surfaced via `session.lastRejection`
  (code + message, rendered by shell/rejection-banner.tsx), and one role
  matrix — `format.can()` — behind both the reducer and `usePermission`
  (veterinarian no longer holds inventory.write).
- Read model — **done**: `lib/vet/catalog.ts` (billable + dispensable
  catalogs), `lib/vet/selectors.ts` (outstandingBalance, lowStockItems with
  the reorderLevel>0 guard, vaccinationOverdue, latestDueByPatient),
  `lib/vet/report.ts` (period windows, trend buckets, metrics, rankings) and
  `lib/vet/worklist.ts` (notification facts) are live and unit-tested.
  Report and worklist are **translation-free**: labels leave as descriptors
  (`{kind:'weekday'}`, `TrendCaptionKey`, fact kinds) and the view owns every
  sentence, so no memo needs `i18n.locale` as a dependency. The worklist
  deduplicates overdue vaccinations (they used to appear twice — the raw
  due-window helper has no lower bound). Calendar slot math lives in
  `lib/vet/schedule.ts` with tests; ScheduleView keeps only the DOM-coupled
  pointer helpers. Consumers: Billing, Dashboard, Inventory, Reports,
  Records, NotificationCenter.
- Deep UI primitives — **done**: `components/vet/modal.tsx` (`Modal`) is the
  one dialog shell — backdrop, Escape, heading, close button, accessible
  name — behind the ten dialogs that used to repeat that markup (PIN, case
  import, patient profile, workspace, restore preview, book/reschedule,
  payment, refund, void, receipt). `components/vet/data-table.tsx` provides
  `DataTable` (wrapper + `table-head` + `empty-state`, six tables) and
  `StatCard` (Dashboard, Billing, Reports). Layout classes stay in the
  stylesheets, keyed off the passed `className`; existing `.modal*`,
  `.table-*`, `.stat-*` hooks are preserved, so screenshots are unchanged.
  **Resolved (2026-10-30 phase B)**: the StaffView/TeamPanel member form and
  row actions now share `staff/member-form.tsx` / `staff/member-row-actions.tsx`.
- `lib/vet/sync.ts` seam — **done**: useSyncWorker owns the debounced push,
  periodic pull, connectivity reset and in-flight mutation lock; the
  ClinicProvider consumes it. store.tsx imports no transport (oxlint now
  denies @/lib/vet/backend there); backend.ts has interface tests.
- Sidecar `store.Validate` becomes the single document validator — partially
  superseded: the three guards are now aligned and fixture-pinned; full
  consolidation behind the sidecar remains optional.

2026-10-30 plan deltas (all executed 2026-10-30):

- **Modal focus management — done (Phase A)**: the box takes focus on open,
  Tab/Shift+Tab wrap inside the dialog (module `dialogStack` — only the top
  dialog of a nested pair traps), and focus returns to the opener on close.
  Only markup delta: `tabIndex={-1}` on the box; screenshots unchanged.
- **StaffView/TeamPanel member-form + row-action dedup — done (Phase B)**:
  `staff/member-form.tsx` (`useMemberForm`, `useSwitchAccount`) and
  `staff/member-row-actions.tsx` (sign-in / PIN / activate buttons) sit
  behind both surfaces; the workspace dialog imports them through
  `../staff`'s public index — the one sibling-internals import
  (`../staff/team-panel`) is gone. Residual: the per-row role selects keep
  their per-surface elements (`select` vs `NativeSelect`).
- **Split oversized Views — done (Phase C)**: trigger rule stands — a View
  earns `components/` extraction past ~450 lines or a second dialog.
  Executed: schedule 724 → 445 (+ appointment-card, booking-dialog,
  month-calendar, waiting-queue, upcoming-list, walk-in-form), consultations
  631 → 125
  (+ closed-encounter, clinical-notes, prescription-panel, vaccination-,
  vitals-, follow-up panels, patient-snapshot, no-active-consultation),
  workspace 480 → 94 (+ clinic/account/roles panels), reports 478 → 348
  (labels.ts + export-csv.ts beside; pure `csvCell`/`csvMoney` moved into
  `lib/vet/report.ts` with tests), billing 456 → 312 (+ payment, refund and
  void dialogs beside the receipt).
- **Sibling-View internals lint tripwire — done (Phase D)**: oxlint denies
  the twelve `../<view>/*` imports from `src/features/**`; `../<view>` (the
  public index) stays legal for shell composition and cross-feature reuse
  (workspace → staff). Verified in both directions — clean tree passes,
  injected `../staff/team-panel` import errors.

## Build orchestration

The root `Makefile` is the entrypoint for anything that crosses language
boundaries (`make lint`, `make test`, `make sidecar`, `make test-pages`,
`make ci`). Each JS app owns its tooling entirely (`apps/clinic` and
`apps/landing` each have a package.json, pnpm-lock.yaml, and node_modules);
knip is a clinic devDependency and only audits `apps/clinic`. The repo root
has no package.json, lockfile, or workspace file — Make is the only root task
surface. Tauri's `beforeDevCommand`/`beforeBuildCommand` go through
`make -C ../.. sidecar`, which only rebuilds when the sidecar's Go sources
changed.

## Target design ↔ clinic mapping

The canonical frontend design (`app/ pages/ features/ components/ lib/` +
TanStack Query + Zustand) is recorded in
`docs/plans/2026-10-31-folder-structure-alignment.md`. Clinic implements
its substance under its own names — translate, don't rename (decisions D1–D6):

| Design says | Clinic is | Why different |
|---|---|---|
| `app/` composition only | `app/App.tsx` + `main.tsx` + `shell/` | shell owns nav + gates + view routing |
| `pages/` thin screens | each View's `index.tsx` | Tauri single-shell, no URL space (D1) |
| `features/<name>/` barrel | `features/vet/<view>/index.tsx` | `vet/` segment kept (D2) |
| `components/patterns/` | `components/patterns/` | renamed from `components/vet` in R1 (2026-10-31 execution) — hooks still intentional |
| `lib/` infrastructure | `lib/` (i18n, theme, utils) + `lib/platform/` | platform moved under lib in R1 |
| `features/session/` chrome | `features/vet/session/` barrel | lock-screen, pin-dialog, language-toggle left feature top-level |
| feature-internal domain | `lib/vet/` central | one fixture-pinned document, one store (ADR-0012) |
| TanStack Query + Zustand | `store.tsx` reducer + hooks + persistence seam | offline document app, not HTTP (D5) |
| `*.api.ts` / `*.keys.ts` / `*.store.ts` | — (no per-feature server state) | naming standard for new apps only (D6) |

Boundary enforcement is the same idea, different tool: oxlint
`no-restricted-imports` + the sibling-View tripwire instead of the design's
ESLint regexes — both deny feature internals past the barrel.

## Known debt (checked, deliberate)

- oxlint warnings (~30: array sort mutation, function scoping, hook deps,
  render purity) are advisory; `pnpm -C apps/clinic lint:strict` blocks on
  them. Burn them down file-by-file; don't let new ones land.
- knip warns on unused exports — fix when touching the file.
- Migration 0005 skips version 4 on the Rust side (sidecar-only 0004);
  intentional, don't "fix" the gap.
