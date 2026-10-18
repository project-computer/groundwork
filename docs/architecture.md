# Architecture

Single app: `apps/clinic` (Tauri 2 + React + TypeScript + SQLite).
UI model and persistence follow ADR 0009 (VetDesk port).

```
React UI (src/features/vet — VetApp, panels, dialogs)
   |
   v
Store API (src/lib/store.ts — same API on every platform)
   |
   +---> Tauri backend: invoke() -> Rust commands (src-tauri/src/clinic.rs)
   |         |
   |         v
   |     SQLite (migrations 0001+0002, WAL, FK enforcement)
   |
   +---> Web fallback: localStorage (src/lib/store.ts) — dev/browser only,
         NOT durable; web target later gets IndexedDB + sync warnings
```

## Rules

- UI components import from `@/lib/store` and `@/lib/types` only — never
  `invoke`, never SQL.
- All mutations go through store functions; each Rust command validates and
  writes atomically; bulk import/merge run in one transaction.
- `src/platform/` detects Tauri vs browser (`isTauri`).
- Rich sub-documents (SOAP records, settings) are JSON in SQLite; anything
  filtered or joined gets a real column.
- Rust modules: `db.rs` (open/migrate), `clinic.rs` (commands + row
  mapping).

## Migration history

- 0001: initial normalized schema (owners/pets/visits/…) — superseded.
- 0002: drops 0001 tables, creates VetDesk model (see docs/data-model.md).
