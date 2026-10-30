# ClinicContext resolver — replace hard-coded `clinicID := 1` and add `users.clinic_id`

## What to build

Replace every `clinicID := 1 // TODO` in `server/internal/handlers/` with a single helper, `auth.GetClinicID(c) int`, that returns `1` today (until multi-branch goes live). Add a migration that introduces `users.clinic_id INT NOT NULL DEFAULT 1 REFERENCES clinics(id)` and backfills existing rows. Document the resolver's contract at the top of `middleware/auth.go` so activating multi-branch later = swap the resolver body, nothing else.

Backend behavior is identical end-to-end; no new endpoints, no UI changes. The hard-coded `clinicID := 1` in non-handler code (e.g. `dashboard_handler.go:23`) is replaced by the same call.

## Acceptance criteria

- [ ] Migration applies cleanly to existing data; `users.clinic_id = 1` for all rows.
- [ ] `grep -rn 'clinicID := 1' server/internal 2>/dev/null` returns zero matches.
- [ ] Every smoke test from slice 0000 still passes.
- [ ] A `middleware/auth_test.go` confirms `GetClinicID` returns `1` for the present code path.
- [ ] ADR-0019 (defer-but-ready multi-tenancy) is referenced in the resolver file's comment header.

## Blocked by

- Slice 0000 (test infrastructure)
