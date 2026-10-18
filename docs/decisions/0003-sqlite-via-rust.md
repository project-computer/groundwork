# 0003 — SQLite in Rust behind Tauri commands

- Status: accepted
- Date: 2026-10-16

## Context

Desktop and mobile need a durable local database with real transactions,
foreign keys, and migrations. The UI must never issue SQL.

## Decision

rusqlite (bundled) in `src-tauri`, exposed through domain-specific Tauri
commands only — no generic `db_execute`. WAL mode, FK enforcement on every
connection, app-data-dir location (`clinic.db`).

## Consequences

- Same Rust persistence core serves desktop and mobile.
- Web needs a separate adapter (IndexedDB); browser storage is evictable, so
  the web target must warn and encourage export/sync.
- rusqlite `backup` feature is enabled now for Phase-3 backup/restore.
