# Folder-structure alignment — one target design, every frontend

- Date: 2026-10-31
- Source: target frontend design reviewed 2026-10-31 (the `clinic-app`
  scaffold: `app/ pages/ features/ components/ lib/`, feature barrels,
  TanStack Query + Zustand, lint-enforced boundaries, naming cheat sheet,
  growth triggers). This plan is the durable record of that design and the
  plan for conforming every frontend to it.
- Scope: **A** — `apps/clinic` (this repo); **B** — the reusable playbook for
  the next frontend (e.g. the Markdown Note App, outside this repo).
- Status: **partially superseded + executed 2026-10-31.** On the owner's
  call the clinic app was aligned *literally* to the target design after
  all — R1 (namespaces: `components/patterns`, `lib/platform`,
  `features/vet/session/`), R2 (per-View `components/` grouping; reports
  `utils/`), R3 (docs — this file and the skill docs). That supersedes
  **D3** (Views now carry `components/` subfolders; deeper subgroups still
  by trigger) and **D4** (`components/vet` renamed to `components/patterns`).
  **D1, D2, D5, D6 stand**: no router/pages layer, `vet/` segment kept, no
  Query/Zustand for the document store, naming standards for new apps.
  Reference implementation of the full design: `~/Desktop/clinic-app`
  (standalone scaffold).

## Part A — apps/clinic against the target design

The clinic app already implements the design's substance — it was the
proving ground for it (see the executed
[2026-10-30 plan](2026-10-30-architecture-alignment.md)). Verdict per design
element:

| Design element | Clinic today | Verdict |
| --- | --- | --- |
| `app/` composition only | `app/App.tsx` + `main.tsx` + `features/vet/shell/` (nav, gates, view routing) | **conforms** — shell plays the layouts role |
| `pages/` thin route screens | Views *are* the pages; `shell/` switches them | **mapped, not renamed** — see D1 |
| `features/<name>/` with one `index.ts` door | `features/vet/<view>/index.tsx`, one View export each | **conforms** modulo the `vet/` segment — see D2 |
| Per-feature `components/hooks/api/store/types` scaffold | modules flat beside the View, extracted by trigger (~450 lines / second dialog) | **trigger wins** — see D3 |
| `components/ui` + `components/patterns` | `components/ui` (primitives) + `components/vet` (shells hardcoding clinic CSS hooks) | **mapped** — see D4 |
| `lib/` = infrastructure, no domain | `lib/` (i18n, theme, utils) + `lib/vet/` (domain: store, read-models) + `platform/` | **mapped** — `lib/vet` is the design's "feature-internal domain" living central by design (ADR-0012 document store) |
| TanStack Query per feature | one JSON document through the persistence seam; the reducer is the "server" | **reject for clinic** — see D5 |
| Zustand per feature | one document, one reducer + hooks (`store.tsx`) | **reject for clinic** — see D5 |
| Lint-enforced boundaries | oxlint `no-restricted-imports` + the sibling-internals tripwire (phase D, verified both directions) | **conforms, enforced** |
| Naming cheat sheet | matches except `*.api.ts` / `*.keys.ts` / `*.store.ts`, which have no clinic equivalents | **adopt in new apps** — see D6 |

## Decisions to lock (D1–D6)

1. **D1 — No router for clinic.** The Tauri shell has no URL space; view
   switching is state in `shell/`. `pages/` as a concept maps to "each
   View's `index.tsx` is the thin page". Browser apps start on
   `pages/` + typed `paths.ts` + `guards/` from day one.
2. **D2 — Keep the `features/vet/` namespace.** Dropping the segment churns
   oxlint patterns, two skill docs and every cross-view import for zero
   behaviour change (same reasoning as 2026-10-30 decision 1).
3. **D3 — Flat-beside with triggers, not pre-built scaffolds.** A feature
   earns subfolders (`components/dialogs/`, `components/table/`) at ~8–10
   files in one level. Pre-creating `hooks/api/store/types` per feature is
   structure before need — the thing the target design's own §6 warns about.
4. **D4 — `components/vet` stays.** The shells intentionally hardcode clinic
   CSS hooks (ADR-0008); renaming to `patterns/` is cosmetic churn. Its
   role *is* the design's `components/patterns`.
5. **D5 — Query/Zustand are for HTTP apps, not the document store.** Clinic
   persists one fixture-pinned JSON document (ADR-0012) with reducer-owned
   invariants (ADR-0015). Wrapping it in Query or splitting it into stores
   would fragment the three guards and the sync seam for no gain.
   New frontends with real backends adopt Query + Zustand per the design.
6. **D6 — Naming: adopt where new.** `*.api.ts`, `*.keys.ts`, `*.store.ts`,
   `*.ui.store.ts` become the standard in new apps; clinic documents the
   mapping instead of renaming files that have no such concepts.

### Clinic execution

- **A1 — done**: the "Target design ↔ clinic mapping" section lives in
  REFERENCE.md.
- **A2 — done**: D1–D6 ratified as written; D3/D4 later revised by the
  literal-alignment execution below (owner's call, same day).
- **R1–R3 — done 2026-10-31** (`6d78f3b`, `6a39bf2`, docs in this commit):
  `components/vet/` → `components/patterns/`; `platform/` → `lib/platform/`;
  lock-screen / pin-dialog / language-toggle → `features/vet/session/`
  (barrel); save-error-banner → `components/patterns/`; error-boundary →
  `app/`; every View's parts grouped under `<view>/components/` (reports
  splits `utils/export-csv.ts` + `components/labels.ts`); oxlint `@/platform`
  deny updated to `@/lib/platform`; REFERENCE.md + SKILL.md rewritten for the
  new tree. Gates after each phase: `lint:strict` clean, 215/215 tests.
  Supersessions: D3 (components/ grouping adopted), D4 (renamed).
- **R4 — done 2026-10-31 (owner requirement)**: all test files moved into
  `__tests__/` (unit + component) and `__componentTests__/` (screenshot,
  with their `__screenshots__/` baselines moved in lockstep — vitest derives
  the baseline path from the test file's location). Watch out: imports
  inside moved tests shift one level (`./x` → `../x`) and clinic's
  double-quote style evades single-quote seds — audit both quote styles.

## Part B — the reusable playbook (next frontend, e.g. Markdown Note App)

Day 1 scaffold — nothing more:

```
src/
├─ app/            AppProviders, query-client.ts, router (index, paths.ts,
│                  guards/), layouts (Root, Dashboard, Auth)
├─ pages/          thin screens (≤ ~150 lines), one folder per area
├─ features/       2–3 real features, each: index.ts barrel,
│                  components/ hooks/ api/ store/ types/ (fill on demand)
├─ components/     ui/ (Button, Input, Dialog, Table, Skeleton)
│                  patterns/ (DataTable, PageHeader, ConfirmDialog)
├─ lib/            api/client.ts + api-error.ts, storage/, utils/, env.ts
├─ hooks/          domain-agnostic (useDebounce, useMediaQuery)
├─ types/ styles/ assets/ test/
└─ main.tsx
```

The three files that make it work (from the design, verbatim intent):

1. **Barrel** — `features/<name>/index.ts` is the only import surface;
   relative `./` inside your own feature, `@/` for everything else.
2. **Query-key factory** — `api/<name>.keys.ts`; server state lives only in
   the Query cache, never mirrored into stores.
3. **UI store** — `store/<name>.ui.store.ts` for view state only
   (selectedDate, viewMode).

Lint from day one (ESLint scoped to boundaries, or oxlint first with this
scoped rule — clinic's `.oxlintrc.json` is the working reference):

- deny `@/features/<name>/<anything>` — the barrel is the door;
- deny `@/(app|pages)/` outside those layers;
- one-way layering: `app → pages → features → components → lib`.

Growth triggers (carried from clinic, proven): ~450 lines or a second
dialog → extract into the owning feature; third consumer of a piece →
promote (domain-free → `components/`, domain-bound → own feature or owner's
barrel); ~8–10 files at one level → subgroup; never pre-create an
`entities/` layer.

Sequencing: clinic A1 lands as one docs PR; the playbook applies the next
time a frontend is started or the Markdown Note App is restructured — start
from the scaffold, don't migrate shape-first (migrate feature-by-feature,
one barrel per PR, tests beside).

## Standing rules (unchanged)

- Skill docs update in the same PR as the code; REFERENCE.md never trails.
- Every phase lands green: `pnpm -C apps/clinic test`, `lint:strict`,
  `make lint-ts` where TS is touched.
- Status line below is updated as items land.
