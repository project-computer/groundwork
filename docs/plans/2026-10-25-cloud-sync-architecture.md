# Cloud Sync Architecture (Tauri + Go Sidecar)

> **Status: EXECUTED** (2026-10-25). Sidecar, sync endpoints, and UI wiring
> are implemented and tested. See ADR 0010.

> **Goal:** Offline-first cloud sync for `apps/clinic` with a Go sidecar that
> owns the local SQLite document and syncs with the Go cloud API.

---

## What actually shipped

The codebase persisted a single `clinic_state` JSON document (migration 0003)
rather than normalized tables, and already had an entity-level `outbox` in the
document. Sync therefore operates on **entities**, not SQL rows — the original
normalized-table design was dropped.

```
React UI (src/lib/vet/store.tsx — API unchanged)
   |  fetch loopback HTTP (Tauri only)
   v
Go sidecar clinic-core (desktop/, bundled externalBin)
   - SQLite clinic_state + sync_meta (WAL, FK on)
   - GET/PUT /state, POST /sync/run, GET /sync/status
   - push outbox entities + pull-by-version
   |  HTTPS (Bearer token)
   v
Go cloud API (backend/) — /api/v1/sync/push, /api/v1/sync/pull
```

- Rust shell spawns the sidecar, reads `LISTENING http://127.0.0.1:<port>`,
  and serves it to the UI via the `backend_url` Tauri command. Rusqlite
  commands remain as a fallback when the sidecar is unavailable.
- Web stays on localStorage; sync is Tauri-only.

## Implemented pieces

### Sidecar (`apps/sidecar/`)

- `internal/db` — opens SQLite, applies embedded migrations 0001–0004
  (`schema_migrations` table, forward-only, one transaction each).
- `internal/store` — loads/saves the clinic document with the same structural
  validation as Rust `validate_state`; read/write `sync_meta` keys.
- `internal/sync` — `Engine.Run` pushes pending outbox entries, merges
  server-reported conflicts, pulls changes after the stored cursor, prunes
  acknowledged outbox entries, and persists the document.
  - Wire format is an envelope: `{"entity": {...}, "parentId": "..."}` so
    nested records (notes, diagnoses, prescriptions) can be reattached to
    their encounter.
  - Merge is last-write-wins per server-assigned `serverVersion`, falling
    back to the client `version` for legacy rows; version-less records
    (payments, stock movements, notes) are append-only. Deletes are honored.
  - The server's canonical payload is merged for every push result, so local
    rows store `serverVersion` even on an applied (not just conflicted) push.
- `internal/api` — loopback HTTP server with CORS for `localhost:1420`.
- `cmd/clinic-core` — env: `VET_DB`, `VET_PORT` (default random),
  `VET_CLOUD_URL`, `VET_DEVICE_TOKEN`, `VET_CLINIC_ID` (default `clinic-01`).
  Prints the bound URL on stdout.
- `scripts/build-sidecar.sh` stages the binary with the target-triple suffix
  Tauri expects. Wired into `beforeDevCommand`/`beforeBuildCommand`.

### Frontend

- `src/lib/vet/backend.ts` — discovers the sidecar URL (`backend_url`),
  loads/saves state, and runs sync. Returns `null` only in the browser demo;
  in Tauri a missing sidecar or a 503 (cloud not configured) throws so the
  outbox stays queued instead of being falsely acknowledged.
- `store.tsx` — loads from the sidecar first, falls back to `invoke`;
  a debounced sync worker (300 ms after a commit) plus a 60 s pull interval
  dispatch `syncResult` with the merged document. Business mutations are
  refused while a sync pass is in flight so a result cannot overwrite a
  concurrent edit. The old simulated acknowledgement remains only for the
  browser demo.

### Cloud API (`backend/`)

- Migration `000002_sync`: `sync_entities` keyed by
  `(clinic_id, entity_type, entity_id)` plus a shared `sync_version_seq`.
- `POST /api/v1/sync/push` — transactional batch (max 500), serialized per
  clinic with an advisory lock so version allocation commits in order. LWW
  on `occurred_at` with a 5-minute future-skew check; losing changes return
  `status: "conflict"` with the canonical server payload. Retries with an
  equal timestamp are idempotent.
- `GET /api/v1/sync/pull?since=N` — up to 1000 rows ordered by server
  version; returns the last returned version as `latestVersion`.
- The server injects `serverVersion` into every stored entity payload and
  echoes the incoming `occurredAt` in push results so outbox acks match.
- Auth reuses the existing JWT middleware; clinic comes from `X-Clinic-ID`
  and defaults to `clinic-01`.
- `fullResync` is in the wire contract but retention/resync is deferred.

## Tests

- `apps/sidecar/`: migrations, document API (round trip, validation, CORS, 503
  when unconfigured), sync engine (nested parent ids, outbox pruning,
  LWW/stale rejection, nested delete, conflict adoption, cursor advance).
- `backend/`: sync handler (batch accept, validation, cursor parsing,
  clinic header). Repository/DB behaviour needs a live Postgres to exercise.
- Go tests (`apps/sidecar/`, `backend/`) pass; the frontend browser suite is
  being refactored in parallel.

## Deferred

- Per-field merge and multi-device auth/device registry (JWT only today).
- Attachment/blob sync and delete tombstones from the UI (no delete actions).
- Postgres-backed integration tests for `SyncRepository`.
- Mobile and web sync adapters.
- Retry/backoff beyond the 60 s interval and error surfacing in the UI
  (`session.lastSyncError` is set but not rendered).
