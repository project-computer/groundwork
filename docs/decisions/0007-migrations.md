# 0007 — Hand-rolled versioned SQL migrations

- Status: accepted
- Date: 2026-10-16

## Context

Schema must evolve safely on user machines with existing data — no `CREATE
TABLE` wipes, no silent failures.

## Decision

Numbered SQL files in `src-tauri/migrations/`, tracked in a
`schema_migrations(version, applied_at)` table. Each migration applies inside
a transaction; already-applied versions are skipped. No migration framework
dependency.

## Consequences

- Migrations are plain SQL — reviewable, testable against fixtures.
- Downgrades are out of scope; forward-only with tested rollforward.
