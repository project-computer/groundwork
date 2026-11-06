# Rotating local log files for the sidecar

- Status: **landed 2026-11-06.** `internal/logging` (5 MB × 3 generations,
  best-effort), wired in `cmd/clinic-core/main.go`; shell mirrors sidecar
  stderr and its own lifecycle events to `shell.log`
  (`src-tauri/src/lib.rs`). Tests: `logging_test.go` (append, overflow
  rotation, broken dir).

## What to build

The sidecar logs to stderr only (`log.New(os.Stderr, "clinic-core: ", …)`);
once bundled, that output is invisible unless a debugger attached at launch.
Support for a pilot clinic needs persistent, rotated logs.

- Sidecar: write logs to `<data dir>/logs/clinic-core.log`, size-capped
  rotation (e.g. 5 MB per file, keep 3 — mirror the backup-rotation
  discipline: new file first, delete oldest after). Keep stderr as a tee so
  existing shell-side diagnostics don't regress.
- Log lines stay minimal and PHI-free (current style: lifecycle, config,
  port announcement, sync outcomes, auth failures without header values).
- Rust shell: capture sidecar stderr and, when the sidecar is unavailable,
  write the shell's own spawn/fallback events to a sibling log file so the
  folder is useful even in the degraded path.
- Settings: show the log folder path (open-folder button) next to the
  backup-folder path — one more diagnostics affordance, no new screen.

## Acceptance criteria

- [ ] Logs persist across launches in the app data directory.
- [ ] Rotation triggers at the size cap; folder never exceeds cap × count.
- [ ] A sync failure and a 401 from ADR-0020 middleware appear in the log
      without leaking the secret.
- [ ] Web target unaffected (no logger wired outside desktop).
- [ ] `make lint-go` and sidecar tests pass; log writes are best-effort —
      a read-only log dir must not prevent startup.

## Blocked by

- Nothing — independent (only worth landing alongside 0013–0015 so the auth
  and backup events are observable from day one).

## Status — shipped 2026-11-06

- Sidecar: `internal/logging` size-capped rotating file (5 MB × 3) tee'd with
  stderr, best-effort — a broken log dir never blocks startup
  (`logging_test.go`).
- Rust shell: sidecar stderr is mirrored into `<data dir>/logs/shell.log`
  alongside the shell's own spawn/fallback events, same cap-and-rotate
  discipline.
- Settings shows the log folder path beside the backup folder path.
