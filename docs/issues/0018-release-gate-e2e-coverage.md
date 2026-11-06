# Release-gate E2E coverage — the clinic-day scenarios

- Status: **landed 2026-11-06** for the automatable rows. Web restart
  persistence: `e2e/pages/clinic-shell.spec.ts` (persisted document loads +
  survives reload). Crash-consistency: `store_test.go`
  (`TestSaveRejectsTruncatedDocumentAtomically`). Legacy-file upgrade:
  `backup.test.ts` (ADR-0014 envelopes without `trigger` keep parsing).
  RBAC: settings toggle disabled for non-admins (component test) + reducer
  rejection tests. Refund/void audits: existing billing component tests.
  Still manual before pilot: installer on a clean Windows machine, restore
  against a sidecar-backed Tauri build, and the veterinarian walk-through.

## What to build

The external MVP plan's §8 scenario list is the release gate. Map each
scenario to automated coverage; fill the gaps with Playwright specs
(`apps/clinic/e2e/`) and Go/Rust tests where the seam is lower. Current
e2e inventory: `clinic-shell.spec.ts`, `appointments-responsive.spec.ts` —
everything below beyond that is new.

| Scenario | Existing evidence | Gap → work |
| --- | --- | --- |
| Restart persists all data | Rust/sidecar round-trip tests | Playwright: save → relaunch shell → assert document |
| Restore backup recovers history | `parseBackup` + reducer tests | Playwright through Settings preview flow (after 0015: assert snapshot file exists) |
| Offline: core flows work | web/localStorage fallback tests; sidecar runs offline by design | Playwright with sidecar route blocked → degraded-path smoke |
| Login role cannot do admin ops | reducer `can()` rejections + `lastRejection` channel | Playwright: receptionist session hits an admin action → rejection banner |
| Crash during save leaves no partial state | single-document write (ADR 0012) by design; `parseClinicState` rejects foreign payloads | Go test: interrupted write → invalid/truncated row is rejected, app falls back |
| Upgrade keeps existing data usable | migration runners; ADR-0014 version-bump rule | Test: v1 backup file restores under current code; fixture version-bump path |
| Walk-in appears in queue | `walkIn` action + queue unit tests | Playwright: walk-in → waiting queue → start visit |
| Partial payment leaves correct balance | reducer characterisation tests | Playwright: invoice → partial payment → outstanding shown |
| Installer on clean Windows machine | none (manual) | Manual checklist in `docs/workflows` or e2e README; run before each pilot |
| Audit trail for corrections | audit events on every commit | Selector test: void/refund/correction events present for a seeded scenario |

Priorities: restart-persistence, restore, offline, RBAC-denial first — they
are the plan's pilot gates; the rest follow.

## Acceptance criteria

- [ ] Every scenario row has either an automated test (named in the row's PR)
      or a documented manual step.
- [ ] `make test` + Playwright suite green, including the new specs.
- [ ] The table above is updated with test file paths once landed.
- [ ] A veterinarian has walked the complete visit workflow once on a real
      install before pilot (plan's release gate — manual, recorded here).

## Blocked by

- 0015 for the restore-recovery row (assert the safety snapshot).
- 0013 for the offline row's 401/degraded-path assertions.
