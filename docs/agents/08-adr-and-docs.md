# Agent 08 — ADRs and Documentation

Read `00-shared-context.md` first. Requires agent 01 (structure exists).

## Goal

Write the decision records and reference docs so Phase 2 agents inherit
clear, documented decisions.

## Tasks

1. `docs/decisions/` — concise ADRs (status/date/context/decision/
   consequences, ~1 page each):
   - `0001-desktop-first-tauri.md` — why Tauri 2 local-first desktop MVP;
     coexistence with the legacy `frontend/`+`server/` web stack
     (untouched, separate product path).
   - `0002-monorepo-layout.md` — root pnpm workspace, apps/packages split,
     why legacy `frontend/` is excluded from the root workspace.
   - `0003-sqlite-via-rust.md` — SQLite in Rust behind Tauri commands; no
     SQL in the UI; rusqlite; WAL; FK enforcement.
   - `0004-domain-purity.md` — `@vet/domain` imports nothing from
     React/Tauri/SQL; interfaces + explicit construction, no DI framework.
   - `0005-money-and-time.md` — integer minor units (THB satang),
     UTC ISO-8601 timestamps, UUID v4 ids.
   - `0006-validation-library.md` — Zod (already a dependency pattern in
     the repo's legacy frontend) in `@vet/validation`.
   - `0007-migrations.md` — hand-rolled versioned SQL migrations +
     `schema_migrations` table; rationale vs. a framework.
   - `0008-ui-primitives.md` — Base UI + Tailwind v4 semantic tokens;
     wrapper policy (wrap only for conventions).
2. `docs/architecture.md` — layer diagram (UI → application services →
   domain → repository interfaces → SQLite adapter), layer rules, and the
   future-sync integration boundary (application services, not components).
3. `docs/data-model.md` — every entity with fields, types, constraints,
   status transition tables, and the full SQL DDL reference mirroring
   `apps/clinic/src-tauri/migrations/0001_init.sql` (verify they match —
   if 04 isn't merged yet, write from the plan §5 and mark "verify on
   merge").
4. Update root `README.md` — append (do not rewrite legacy content) a
   "Desktop MVP (new)" section: what it is, prerequisites, commands
   (`pnpm install`, `pnpm -C apps/clinic tauri dev`), and where local
   data is stored.

## File boundaries

ONLY: `docs/decisions/**`, `docs/architecture.md`, `docs/data-model.md`,
root `README.md` (append-only section).

## Verification

- Every ADR ≤ ~60 lines, states a real tradeoff, no filler.
- `docs/data-model.md` DDL matches the actual migration file or is
  explicitly marked pending.
- Report a one-paragraph summary of each ADR decision for the user to
  approve.

## Notes

- Document assumptions; flag anything needing user approval
  (e.g. bundle identifier, currency default THB).
- Do not commit.
