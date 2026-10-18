# Agent 02 — Tauri 2 Setup

Read `00-shared-context.md` first. Requires agent 01 to be complete.

## Goal

Add Tauri 2 to `apps/clinic` so `pnpm tauri dev` opens a desktop window
rendering the existing React app.

## Tasks

1. `pnpm -C apps/clinic add -D @tauri-apps/cli` and
   `pnpm -C apps/clinic add @tauri-apps/api`.
2. Add script `"tauri": "tauri"` to `apps/clinic/package.json`.
3. Create `apps/clinic/src-tauri/`:
   - `Cargo.toml` (crate `vet-desktop`, tauri ^2 features as needed).
   - `tauri.conf.json`:
     - identifier: `com.vetclinic.desktop` (placeholder, note it).
     - window: 1280×800, min 1024×700, title "Vet Clinic".
     - devUrl matches Vite (default 5173) — ensure it cannot collide with
       the legacy frontend dev server; if 5173 is ambiguous, pin a distinct
       port (e.g. 1420) in BOTH vite.config.ts and tauri.conf.json.
   - `src/main.rs` + `src/lib.rs` with the default Tauri 2 builder
     (no custom commands yet — agent 04 adds them).
   - `capabilities/default.json` with the minimal capability set
     (core defaults only; expand later when commands exist).
   - `build.rs` standard tauri_build hook.
   - Icons: generate via `pnpm tauri icon` from a simple placeholder PNG
     (create one; do not copy copyrighted art).
4. Ensure Linux dev prerequisites exist (webkit2gtk etc.); if missing,
   install via apt and record what was installed.

## File boundaries

ONLY: `apps/clinic/src-tauri/**`, `apps/clinic/package.json`,
`apps/clinic/vite.config.ts` (port fix only),
`apps/clinic/src-tauri/.gitignore` for `target/`.

## Verification (run and report output)

```
pnpm -C apps/clinic tauri build --debug   # or at minimum: cargo check in src-tauri
pnpm -C apps/clinic build
```

If a headless environment blocks `tauri dev`, verify via
`cargo build` + `tauri build` and state that interactive launch was not
possible.

## Notes

- Do not add updater, tray, or plugins — not needed for MVP.
- Do not commit.
