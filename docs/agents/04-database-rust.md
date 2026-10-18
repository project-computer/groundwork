# Agent 04 — SQLite + Migrations (Rust)

Read `00-shared-context.md` first. Requires agent 02.

## Goal

Implement the local persistence core in Rust: SQLite initialization,
versioned migrations, foreign keys, and Tauri commands exposing a safe
database handle to the frontend.

## Tasks

1. `src-tauri/Cargo.toml`: add `rusqlite` (bundled SQLite, `backup` feature)
   and `tauri-plugin-dialog` later only if needed. Use `serde`, `serde_json`,
   `uuid` (v4), `chrono` (UTC).
2. Database location: Tauri `app_data_dir()` + `clinic.db`. Create the dir
   on startup. Enable `PRAGMA foreign_keys = ON` and `journal_mode = WAL`
   on every connection.
3. Migrations framework (keep it simple — no heavyweight framework):
   - `src-tauri/migrations/0001_init.sql` creating the full Phase-1 schema:
     `owners`, `pets`, `appointments`, `visits`, `medical_records`,
     `products_services`, `visit_items`, `payments` per the data model in
     the plan (§5). Include:
       - UUID text primary keys.
       - `created_at`/`updated_at` TEXT NOT NULL (UTC ISO-8601).
       - FKs with `ON DELETE RESTRICT` for finalized records,
         `ON DELETE CASCADE` only for draft-dependent rows — justify each.
       - Money: INTEGER minor units (satang). Weight: REAL + TEXT unit.
       - CHECK constraints for status enums.
       - Indexes on FK columns + `pets.name`, `owners.name`,
         `appointments.scheduled_at`, `appointments.status`.
   - `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)`.
   - Rust runner applying pending migrations inside a transaction.
4. Tauri commands (registered in `lib.rs`):
   - `db_status() -> { version, path }`
   - `db_execute` is FORBIDDEN — no raw SQL from the frontend. Only
     domain-specific commands will be added per feature in Phase 2.
5. Unit tests in Rust (`cargo test`) covering: fresh init applies all
   migrations, re-run is a no-op, FK enforcement is on, transaction
   rollback works (insert two rows in a tx, fail the second, verify neither
   persisted).

## File boundaries

ONLY: `apps/clinic/src-tauri/**`.

## Verification (run and report output)

```
cargo test --manifest-path apps/clinic/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/clinic/src-tauri/Cargo.toml
pnpm -C apps/clinic tauri build --debug   # or cargo check if headless
```

## Notes

- Use a temp-dir database in tests — never the real app data dir.
- Backup/restore is Phase 3 — do not implement it, but keep the rusqlite
  `backup` feature enabled so it is possible later.
- Do not commit.
