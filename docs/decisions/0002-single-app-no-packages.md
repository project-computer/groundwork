# 0002 — Single app, no workspace packages (yet)

- Status: accepted
- Date: 2026-10-16

## Context

The original plan proposed a pnpm monorepo with `packages/domain`,
`packages/validation`, etc. With one app, packages add install/build friction
without a second consumer.

## Decision

Keep everything in `apps/clinic`. Layering is enforced by folder:

- `src/domain/` — pure logic, no framework imports
- `src/validation/` — Zod schemas
- `src/data/` — repository adapters (Tauri / in-memory; IndexedDB later)
- `src/platform/` — Tauri-vs-web capability detection

Extract a workspace package only when a second consumer exists.

## Consequences

- Simpler installs, builds, and tests (one suite, 41 tests).
- A lint rule or code review must guard `src/domain/` purity — the package
  boundary no longer does it mechanically.
