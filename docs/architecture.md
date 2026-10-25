# Architecture

Single app: `apps/clinic` (Tauri 2 + React + TypeScript) with a bundled Go
sidecar (`apps/sidecar/`) that owns the local database and cloud sync. UI model and
persistence follow ADR 0009 (VetDesk port); see ADR 0010 for the sidecar
decision.

```
React UI (src/features/vet — VetApp, panels, dialogs)
   |
   v
Store API (src/lib/vet/store.tsx — same API on every platform)
   |
   +---> Tauri desktop: HTTP -> Go sidecar clinic-core (desktop/)
   |         |                     127.0.0.1:<random port>
   |         v
   |     SQLite clinic_state (WAL, FK enforcement)
   |         |
   |         v
   |     sync engine: entity outbox + pull cursor
   |         |
   |         v
   |     Go cloud API (backend/) — /api/v1/sync/push|pull
   |
   +---> Tauri fallback (sidecar missing): invoke() -> Rust commands
   |         (apps/clinic/src-tauri/src/clinic.rs) -> same SQLite file
   |
   +---> Web fallback: localStorage (dev/browser only, NOT durable)
```

## Rules

- UI components import from `@/lib/vet/store` and `@/lib/vet/types` only —
  never `invoke`, never SQL, never direct sidecar HTTP (use
  `src/lib/vet/backend.ts` from the store only).
- All mutations go through the reducer; each commit writes the record, its
  audit event and its outbox entry in one state transition.
- The clinic document is a single JSON blob in `clinic_state`; rich
  sub-documents (SOAP notes, vitals, diagnosis lists) live inside it.
- The Go sidecar (`apps/sidecar/`) validates the document and persists atomically.
  It also owns push/pull; the Rust commands are a degraded fallback only.
- `src/platform/` detects Tauri vs browser (`isTauri`).
- Schema lives in two places and must stay in sync for migrations 0001–0003:
  `apps/clinic/src-tauri/migrations/` (Rust fallback) and
  `apps/sidecar/migrations/` (sidecar, embedded in the binary). Migration 0004
  (`sync_meta`) is sidecar-only.
- Sync unit is an entity (`entityType` + `entityId`), not a table row.
  Conflicts resolve last-write-wins on `occurredAt`, with `version` used for
  merged top-level entities.

## Migration history

- 0001: initial normalized schema (owners/pets/visits/…) — superseded.
- 0002: drops 0001 tables, creates VetDesk model (see docs/data-model.md).
- 0003: `clinic_state` document store (current persistence).
- 0004: `sync_meta` pull cursor (sidecar).
- Backend 000002: `sync_entities` + `sync_version_seq` (cloud).
