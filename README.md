# Vet Clinic — local-first clinic management

One app (`apps/clinic`): Tauri 2 + React + TypeScript + Base UI + Tailwind,
SQLite via Rust. Works offline, no subscription. Same codebase targets
Windows desktop now, Android/iOS later (Tauri mobile), and web later
(same UI, IndexedDB persistence adapter).

## Prerequisites

- Node 20+ and pnpm
- Rust stable (Tauri 2 prerequisites: webkit2gtk on Linux)

## Commands

```bash
pnpm install                  # install all deps
pnpm dev                      # Vite dev server (browser, in-memory data)
pnpm -C apps/clinic tauri dev # desktop shell (SQLite)
pnpm build                    # web build
pnpm lint                     # oxlint
pnpm test                     # TS tests + Rust tests
pnpm test:ts                  # TS only
pnpm test:rust                # Rust only
```

## Where local data is stored

Desktop: OS app-data dir + `clinic.db`, e.g. on Windows
`%APPDATA%/com.vetclinic.desktop/clinic.db`. Visible in-app under
Settings → Database. Backup/restore arrives in Phase 3.

## Decisions

See `docs/decisions/` (ADRs), `docs/architecture.md`, `docs/data-model.md`.
