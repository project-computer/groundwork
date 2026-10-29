# Vet Clinic — local-first clinic management

One app (`apps/clinic`): Tauri 2 + React + TypeScript + Base UI + Tailwind,
with a bundled Go sidecar (`apps/sidecar/`) that owns SQLite and cloud sync. Works
fully offline; sync is optional. Same codebase targets Windows desktop now,
Android/iOS later (Tauri mobile), and web later (same UI, IndexedDB adapter).

## Layout

| Path | Purpose |
|---|---|
| `apps/clinic` | Tauri 2 + React app (the desktop UI) |
| `apps/sidecar/` | Go sidecar `clinic-core`: local SQLite + sync engine |
| `backend/` | Go cloud API (Fiber + Postgres) — only needed for cloud sync |
| `docs/` | Architecture, data model, ADRs, plans |

## Prerequisites

- Node 20+ and pnpm
- Go 1.27+
- Rust stable (Tauri 2 prerequisites: webkit2gtk on Linux)

## Commands

```bash
pnpm install                  # install all deps
pnpm sidecar                  # build the Go sidecar (also runs before Tauri)
pnpm dev                      # Vite dev server (browser, localStorage)
pnpm -C apps/clinic tauri dev # desktop shell (sidecar + SQLite)
pnpm build                    # web build
pnpm lint                     # oxlint + knip (unused files, deps, exports)
pnpm lint:go                  # go vet + golangci-lint (backend)
pnpm fmt:go                   # gofmt the backend
pnpm vuln:go                  # govulncheck (known Go CVEs reachable from code)
pnpm lint:rust                # cargo fmt --check + clippy -D warnings (Tauri shell)
pnpm fmt:rust                 # rustfmt the Tauri shell
pnpm knip                     # knip only
pnpm test                     # TS + Go + Rust tests
pnpm test:ts                  # TS only
pnpm test:go                  # sidecar + cloud API
pnpm test:rust                # Rust only
```

## Languages (English / Thai)

The UI ships in English (`en`, source) and Thai (`th`) via
[Lingui](https://lingui.dev). Strings live in the components as
`<Trans>…</Trans>` / `t` macros; catalogs are PO files under
`apps/clinic/src/locales/{en,th}/messages.po`. English renders from the
source strings; the Thai catalog is lazy-loaded on first use. The language
toggle is in the top bar and the choice persists per device (`vet.locale`,
defaults to the OS language).

```bash
pnpm -C apps/clinic i18n:extract   # sync catalogs with source (new strings appear in both PO files)
pnpm -C apps/clinic i18n:compile   # validate ICU syntax of the catalogs (strict)
```

Workflow for new UI strings: write the English source string inside a
`Trans`/`t` macro, run `i18n:extract`, then fill `msgstr` in
`src/locales/th/messages.po`. Untranslated Thai entries fall back to English.

## Cloud sync

The sidecar stays quiet unless configured:

```bash
export VET_CLOUD_URL=http://localhost:8080
export VET_DEVICE_TOKEN=<bearer JWT from /api/v1/auth/login>
```

It pushes pending outbox entries and pulls newer entities on every local
commit (debounced) and every 60 s. Without `VET_CLOUD_URL` the app is purely
local. See `docs/plans/2026-10-25-cloud-sync-architecture.md`.

## Where local data is stored

Desktop: OS app-data dir + `clinic.db`, e.g. on Windows
`%APPDATA%/com.vetclinic.desktop/clinic.db`. Visible in-app under
Settings → Database. Backup/restore arrives in Phase 3.

## Decisions

See `docs/decisions/` (ADRs), `docs/architecture.md`, `docs/data-model.md`.
