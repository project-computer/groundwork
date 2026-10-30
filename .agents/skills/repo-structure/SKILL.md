---
name: repo-structure
description: VetCare repo architecture rules — where code belongs, the UI → store → persistence → adapter layering, clinic-document and sync invariants, migration sync rules, and test placement. Use when adding, moving, or reviewing files in this repo; changing migrations, sync entities, the store, or persistence; deciding where new code belongs; or when oxlint complains about restricted imports.
---

# Repo Structure — VetCare

Read this before adding a file, and follow it when reviewing structure.
Domain vocabulary lives in `CONTEXT.md`; folder details in
[REFERENCE.md](REFERENCE.md).

## Layering — one direction only

```
src/features/** · src/components/** · src/app/**     (UI)
        │  may import only: @/lib/vet/store, @/lib/vet/types,
        │  @/lib/vet/format, @/lib/i18n, ui primitives, and the pure
        │  read-model modules (@/lib/vet/{catalog,selectors,report,
        │  worklist,schedule,backup,case-transfer,auth})
        ▼
src/lib/vet/store.tsx                                 (domain + orchestration)
        │  document I/O only through ↓
        ▼
src/lib/vet/persistence.ts                            (the persistence seam)
        │  interface: loadState · saveState · loadPlanPref · savePlanPref
        │  owns: isClinicState · parseClinicState · ADR-0012 adapter order
        ├── sidecar HTTP        (via backend.ts)
        ├── Rust invoke()       fallback
        └── localStorage        (web)
```

- **UI never imports** `@tauri-apps/*`, `@/lib/vet/backend`,
  `@/lib/vet/persistence`, `@/lib/vet/seed`, or `@/platform`.
  **store.tsx never imports** `@tauri-apps/*` or `@/platform` either —
  both enforced by `no-restricted-imports` overrides in `.oxlintrc.json`;
  only `backend.ts` and `persistence.ts` may touch transports.
- **All mutations go through the store reducer.** No component writes state,
  SQL, or HTTP directly.
- `commit` writes the record, its audit event, and its outbox entry in one
  state transition — never split those writes.

## The clinic document

- Persistence is **one JSON document** in SQLite `clinic_state` (ADR 0012),
  typed by `src/lib/vet/types.ts`. There is no per-table CRUD layer.
- Document shape has **one home**: `fixtures/clinic-document.json`, mirrored
  by `CLINIC_STATE_COLLECTIONS` in `types.ts`. Three guards enforce it —
  `isClinicState` (TS), `store.Validate` (Go sidecar), `validate_state`
  (Rust) — and conformance tests pin all three to the fixture, so a key added
  in one language without the others fails CI.
- Foreign payloads (storage, backups) go through `parseClinicState`: missing
  collections are backfilled (legacy documents keep loading), a collection
  that is present but not an array is rejected.
- Sync unit is an **entity** (`entityType` + `entityId`). The registry's home
  is `fixtures/sync-entities.json`; `apps/sidecar/internal/sync/entities.go`
  and `backend/internal/service/sync_service.go` are pinned to it by tests on
  both sides.

## Migrations

- Shared migrations **0001–0003 and 0005 must be byte-identical** in
  `apps/sidecar/migrations/` and `apps/clinic/src-tauri/migrations/`
  (0004 is sidecar-only). `diff` them before committing.
- Append new versions; don't rewrite applied ones. The Go runner discovers
  `*.sql`; the Rust runner has a hardcoded list in `src-tauri/src/db.rs` —
  add every shared migration there too.
- Update `docs/architecture.md` migration history and `docs/data-model.md`.

## Invariants belong in the reducer

New business rules (stock floors, refund headroom, RBAC, transitions) go in
the reducer, not in a disabled button. If two places compute the same rule,
one of them is a bug waiting to happen. Use `CONTEXT.md` terms, not synonyms
(Patient, Owner, Visit, Vaccination, InventoryItem, InventoryLot…).

When the reducer refuses an action it records why — `session.lastRejection`
with a stable `code` (ADR-0015) — and `commit` clears it on the next
success. Never add a new silent `return store` guard. The UI renders it via
`shell/rejection-banner.tsx` and derives dialogs from it; enforcement is
never duplicated in components — disabled buttons are presentation only.
The role matrix lives in `format.ts` (`can`/`permissionsFor`) and the
reducer checks it through `can()` — one source for `usePermission` too.

## UI primitives — one shell per shape

Dialogs, tables and stat tiles go through `components/vet/`:

- `Modal` (`modal.tsx`) owns the backdrop, Escape, heading, close button and
  the accessible name. Dialogs describe content only. Pass
  `closeOnEscape={false}` when a nested dialog owns Escape (the workspace
  dialog and its PIN dialog). The receipt surface passes no `title` because
  its own header is the heading.
- `DataTable` (`data-table.tsx`) owns `records-table` / `table-head` /
  `empty-state`; `columns` and `isEmpty`/`empty` replace the hand-rolled
  markup. Per-table grid templates still live in the stylesheets, keyed by
  the `className` you pass (`patients-table`, `staff-table`, …).
- `StatCard` owns `stat-card` / `stat-icon <tone>` / `stat-note`. Tones are
  the closed union `teal | blue | violet | amber | red`.

Keep the existing class hooks (`.modal-backdrop`, `.modal`, `.form-heading`,
`.table-row`, `.stat-*`) — stylesheets and query-based tests target them.
Don't add a new one-off dialog or table wrapper; extend the primitive.

## Tests — through the interface

| Area | Location |
|---|---|
| Pure logic | `src/lib/vet/*.test.ts` (plain Node) |
| Components | `*.component.test.tsx` beside the feature |
| Visual | `*.screenshot.test.tsx` (Vitest browser) |
| Pages | `apps/clinic/e2e/pages/` (Playwright) |
| Go | `*_test.go` beside the package |
| Rust | `src-tauri/tests/` |

Prefer the real reducer and real adapters; mock only what leaves the process.
A test that needs many mocks is a signal the seam is in the wrong place.

## Style gate

- Functions are arrow function expressions — see the `code-standard` skill.
- `pnpm lint` = oxlint (errors fail) + knip (warnings). CI runs it.
- `pnpm -C apps/clinic lint:strict` = oxlint `--deny-warnings`; use it when
  cleaning a file so warnings don't accumulate.

## Pre-flight checklist

- [ ] New code sits in the folder named by [REFERENCE.md](REFERENCE.md)
- [ ] New Views live in `features/vet/<view>/` — one folder per View, dialogs and `*.component.test.tsx` beside
- [ ] No UI import reaches past the store (oxlint enforces)
- [ ] Migrations identical across both dirs and listed in `db.rs`
- [ ] Document shape / entity type updated in **all** copies
- [ ] New invariant lives in the reducer, not the UI
- [ ] Dialogs/tables/stats use `Modal`/`DataTable`/`StatCard`, not new markup
- [ ] Test placed per the table above; `pnpm lint` passes
