# 0010 — Go sidecar owns desktop persistence and sync

- Status: accepted
- Date: 2026-10-25
- Supersedes: 0003 (for desktop persistence ownership)

## Context

Cloud sync needs a long-running engine that drains an outbox, pulls new
entities, and merges conflicts. Keeping that in TypeScript ties it to the
webview lifecycle; keeping it in Rust means duplicating domain rules that the
Go cloud API already understands. The clinic document is a single JSON blob,
so persistence itself is small.

## Decision

Ship a Go sidecar (`apps/sidecar/`, binary `clinic-core`) inside the Tauri bundle:

- Opens the same `clinic.db`, applies embedded SQLite migrations (0001–0004),
  validates and stores the clinic document.
- Exposes a loopback-only HTTP API: `GET/PUT /state`, `POST /sync/run`,
  `GET /sync/status`, `GET /healthz`.
- Runs push/pull against `server/`. Push sends entity envelopes extracted
  from the outbox; pull merges by server-assigned `serverVersion` (falling
  back to the client version), then prunes acknowledged changes.
- Rust keeps the shell: it spawns the sidecar, reads the announced port, and
  exposes it through the `backend_url` command. The rusqlite commands remain
  as a fallback when the sidecar binary is unavailable. The UI refuses
  business mutations while a sync pass is in flight so a returned document
  cannot clobber a concurrent edit.

The UI persists through `src/lib/vet/backend.ts` on Tauri and falls back to
the existing Rust commands, then localStorage on the web.

## Consequences

- Sync logic is testable in Go (`go test ./...` in `apps/sidecar/`) without a
  webview or a database server; the cloud API is tested with handler fakes.
- The sidecar is desktop-only. Tauri mobile and the web target keep the
  Rust/localStorage adapters until a separate decision.
- Two migration directories exist (Rust and Go); 0001–0003 must stay identical.
- The sidecar port is random and loopback-only, and is announced on stdout for
  the Rust parent to parse.
- Packaging must build the sidecar before `tauri build`
  (`pnpm sidecar`, wired into `beforeDevCommand`/`beforeBuildCommand`).
