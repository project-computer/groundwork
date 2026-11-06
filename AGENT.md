# AGENT.md — repo standard for agents (and humans)

You are working in the VetCare repo: a local-first veterinary clinic
management app (`apps/clinic` — Tauri 2 + React + TypeScript) with a bundled
Go sidecar that owns SQLite and sync, plus a Go cloud API and a landing page.
Polyglot: TypeScript + Go + Rust, orchestrated by GNU make at the root.

Read this file before writing code. Where a rule points to a canonical
source, the source wins — this file must not drift from it.

## Non-negotiables

1. **Use the domain vocabulary** from `CONTEXT.md` — `Patient` (never pet),
   `Owner` (never client), `Visit` (never appointment/consultation),
   `Vaccination`, `InventoryItem`, `InventoryLot`, `MRN`, … in code, comments,
   tests, docs, and commit messages. Synonyms are bugs.
2. **All functions are arrow function expressions** assigned to `const` —
   never `function` declarations or `export default`. Named exports, parens
   on every parameter, expression body when it fits on one line. React
   components are arrows with explicit prop types, no `React.FC`. Full rules:
   `.agents/skills/code-standard/SKILL.md`. When you touch a file, convert
   every violation in it in the same change (no half-migrated files, no two
   eras of style).
3. **Layering is one-directional**: UI (`src/features/**`, `src/components/**`,
   `src/app/**`) → `lib/vet/store.tsx` → `lib/vet/persistence.ts` →
   adapters (sidecar HTTP via `backend.ts`, Rust `invoke()`, localStorage).
   UI never imports `@tauri-apps/*`, `backend`, `persistence`, `seed`, or
   `platform`; the store never imports transports. Enforced by
   `no-restricted-imports` in `.oxlintrc.json` — don't work around it.
4. **All mutations go through the store reducer.** No component writes state,
   SQL, or HTTP directly. A `commit` writes the record, its audit event, and
   its outbox entry in one state transition — never split those.
5. **Invariants live in the reducer, not the UI.** New business rules (stock
   floors, refund headroom, RBAC, transitions) go in the reducer; disabled
   buttons are presentation only. When the reducer refuses an action it
   records `session.lastRejection` with a stable `code` (ADR-0015) — never add
   a silent-return guard. One role matrix: `format.can()`.
6. **Single-source fixtures are pinned — update every copy in the same
   change:**
   - Clinic document shape: home is `fixtures/clinic-document.json`, mirrored
     by `CLINIC_STATE_COLLECTIONS` in `types.ts`. Guards `isClinicState` (TS),
     `store.Validate` (Go sidecar), `validate_state` (Rust) are pinned to it
     by tests; a key added in one language without the others fails CI.
   - Sync entity registry: home is `fixtures/sync-entities.json`, pinned to
     `apps/sidecar/internal/sync/entities.go` and
     `server/internal/service/sync_service.go` by tests on both sides.
7. **Migrations are append-only and byte-identical where shared.** Shared
   migrations 0001–0003 and 0005 must be identical in
   `apps/sidecar/migrations/` and `apps/clinic/src-tauri/migrations/` (0004 is
   sidecar-only). Never rewrite an applied migration; register every shared
   one in `src-tauri/src/db.rs` (the Go runner discovers `*.sql`); update the
   migration history in `docs/architecture.md` and `docs/data-model.md`.
8. **One shell per UI shape.** Dialogs, tables, and stat tiles go through
   `components/patterns/` (`Modal`, `DataTable`, `StatCard`) — no one-off
   wrappers, no hand-rolled modal/table markup. Keep the existing class hooks
   (`.modal-backdrop`, `.table-row`, `.stat-*`) — stylesheets and tests target
   them. New styles use Tailwind utilities with token classes (`bg-primary`),
   not new semantic classes.
9. **i18n**: English source strings live inside `<Trans>`/`t` macros; run
   `make i18n-extract`, then fill `msgstr` in
   `apps/clinic/src/locales/th/messages.po`. Untranslated Thai falls back to
   English. Never hardcode user-facing strings outside a macro.
10. **Tests go through the interface and live in the reserved spots:**

    | Area | Location |
    |---|---|
    | Pure logic | `src/lib/vet/__tests__/*.test.ts` |
    | Components | `<view>/__tests__/*.component.test.tsx` |
    | Visual | `<view>/__componentTests__/*.screenshot.test.tsx` |
    | Pages | `apps/clinic/e2e/pages/` (Playwright) |
    | Go | `*_test.go` beside the package |
    | Rust | `src-tauri/tests/` |

    Prefer the real reducer and real adapters; mock only what leaves the
    process. Many mocks = wrong seam.

## Where code lives

Root layout:

| Path | Purpose |
|---|---|
| `apps/clinic` | Tauri 2 + React app (the desktop UI) |
| `apps/landing` | Download page (React + Vite, EN/ไทย) |
| `apps/sidecar` | Go `clinic-core`: local SQLite + sync engine |
| `server` | Go API module: cloud API (Fiber + Postgres, sync only) + the offline REST backend `cmd/vetcare` (`internal/offlineapi/`) |
| `fixtures` | Pinned single-sources: clinic document, sync entities |
| `docs` | Architecture, data model, ADRs, plans |

New frontend Views live in `apps/clinic/src/features/vet/<view>/` — one
folder per View, `index.tsx` exports only the View, parts in
`<view>/components/`. Never import a sibling View's internals; go through its
public barrel (`../staff`). Full folder map and placement rules:
`.agents/skills/repo-structure/` (SKILL.md + REFERENCE.md).

## Commands — `make` is the entrypoint

`make help` lists everything. The ones that matter day to day:

```bash
make install    # pnpm install (clinic + landing)
make dev        # Vite dev server (browser, localStorage adapter)
make tauri      # desktop shell (builds the sidecar first)
make lint       # every linter (TS + Go + Rust)
make fmt        # gofmt + rustfmt
make test       # TS + Go + Rust suites
make test-pages # Playwright page tests
make i18n-extract / i18n-compile
make ci         # exactly what CI runs — run before handing back
```

- pnpm is used only inside `apps/clinic` and `apps/landing` via
  `pnpm -C <app> …`. The repo root has **no** package.json, lockfile, or
  workspace file — never add one; Make is the only root task surface.
- Before declaring work done: `make lint` and the relevant `make test-*` must
  pass. Billing-i18n-refactor scale changes: run `make ci`.

## Docs discipline

- `CONTEXT.md` is the domain language; keep it current when concepts change.
- `docs/decisions/` is the **single, append-only** ADR series (0001–0023).
  New decisions append a new number; never edit or renumber old ADRs. Cite
  the `decisions/` number.
- Docs split living vs historical (`docs/README.md`): update
  `architecture.md` / `data-model.md` with the code; **never** update
  `PLAN.md`, `docs/plans/`, or `docs/agents/` to match later code. A plan
  marks its delta **done** in the same PR that lands it.

## Commits

Conventional commits with a scope: `type(scope): summary` — types in use:
`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`. Scope is an
area, not a ticket: `clinic`, `i18n`, `worklist`, `ui`. Example:
`fix(i18n): load the compiled English catalog — prod rendered raw message ids`.

## Skills

Read the matching skill before its kind of work:

| Skill | When |
|---|---|
| `repo-structure` | Adding/moving files, migrations, sync, store, persistence |
| `code-standard` | Writing/reviewing any TS/JS |
| `component-testing` | Component or screenshot tests in `apps/clinic` |
| `add-page-test` | Playwright page tests |
| `deploy-poc` | Cloudflare Pages PoC deploys |
| `responsive-design`, `web-design-guidelines` | Responsive layouts, UI review |
