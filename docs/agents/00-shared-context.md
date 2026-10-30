# 00 — Shared Context (READ FIRST)

Every agent must read this file completely before writing any code.

## What this project is

A **local-first veterinary clinic desktop application** for small clinics
(2–5 staff). Windows desktop MVP first; cloud sync is a future paid phase.

Authoritative product plan: see the root-level implementation plan
(Tauri 2 / React / TypeScript / Base UI / Tailwind / SQLite). If this file
and the plan conflict, the plan wins — note the conflict in your report.

## Current repository state (assessed Oct 2026)

This repo already contains an UNRELATED prior product:

- `frontend/` — React 19 + Vite + Primer React + styled-components web app
  (has its own `pnpm-workspace.yaml` and lockfile inside `frontend/`).
- `server/` — Go + Fiber + PostgreSQL API.
- `compose.yml`, `Makefile`, `.env` — support the legacy full-stack app.
- `docs/PLAN.md`, `docs/plans/` — legacy plan documents for that stack.

**Do not modify, delete, or "clean up" any of the above.** The new desktop
MVP lives in NEW top-level paths only:

```
apps/clinic/          # Tauri 2 + React + Vite app (src/ + src-tauri/)
packages/domain/       # Domain types + business rules (TS only)
packages/validation/   # Zod schemas shared by domain and UI (create in 05)
docs/decisions/        # ADRs
pnpm-workspace.yaml    # NEW root workspace (must not break frontend/)
```

The existing `frontend/pnpm-workspace.yaml` scopes the legacy app's deps;
verify the root workspace does not absorb `frontend/` (exclude it via
workspace `packages:` list if necessary).

## Hard product constraints

- Local operation must never depend on cloud or subscription.
- No floating-point money. Use integer minor units (e.g. satang for THB).
- Timestamps stored as UTC ISO-8601 strings.
- IDs: UUID v4 (crypto.randomUUID or equivalent).
- The UI must never issue SQL directly; repositories only.
- Domain layer has zero imports from React, Tauri, SQLite, or HTTP.
- Thai text and Thai date/number formatting must render correctly.
- Only implement what the current milestone needs — no speculative sync,
  inventory, auth, or plugin infrastructure.

## Tech versions (confirmed available on this machine)

- Node 26, pnpm 12.9.1, Rust 1.99 / Cargo 1.99 (Tauri 2 prerequisites OK).
- Use latest stable: Tauri ^2, React ^19, Vite ^7/^8, TypeScript ~5.x,
  Tailwind CSS ^4, `@base-ui-components/react` ^1, `zod` ^4, `vitest` ^3+.
  If a scaffold tool picks versions for you, accept stable defaults and
  report what was installed.
- Lint: `oxlint` (already used by legacy frontend — keep consistent).

## Conventions

- Package manager: pnpm only.
- Formatting: standard tool defaults; match neighboring code style.
- Comments: none unless a brief explicitly asks.
- No emojis in code or docs.
- Every brief's verification commands MUST actually be run and their real
  output reported. Failures are reported, not hidden.

## Where data lives at runtime

Desktop app SQLite file goes under the OS app-data dir resolved by Tauri
(`appDataDir`), e.g. `%APPDATA%/<bundle-id>/clinic.db` on Windows. Document
the exact path in user-facing docs; agents 04 and 08 own the details.
