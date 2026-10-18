# Agent 07 — Data Bridge (Repositories over Tauri)

Read `00-shared-context.md` first. Requires agents 04 and 05.

## Goal

Implement the TypeScript persistence adapter: concrete repositories backed
by Tauri commands, plus React Query integration so features can read/write
data through clean interfaces.

## Tasks

1. Add `@tanstack/react-query` to `apps/clinic`.
2. Rust side (extend agent 04's command set minimally, in
   `src-tauri/src/commands/`): implement commands for the Phase-2 starter
   workflows only:
   - `owner_create`, `owner_update`, `owner_get`, `owner_search`
   - `pet_create`, `pet_get`, `pet_list_by_owner`, `pet_search`
   - `appointment_create`, `appointment_list_by_date`, `appointment_update_status`
   All multi-write operations in transactions; parameterized SQL only.
3. TS side `apps/clinic/src/data/`:
   - `tauriRepositories.ts` implementing `OwnerRepository`,
     `PetRepository`, `AppointmentRepository` from `@vet/domain` by
     invoking `invoke(...)`, mapping rows to domain types, and mapping
     Rust errors into typed `RepositoryError`s.
   - A `RepositoriesProvider` context + a browser-dev fallback
     (`inMemoryRepositories.ts`) so `pnpm dev` works without Tauri —
     useful for UI development and tests. Selection via
     `window.__TAURI_INTERNALS__` detection.
4. Wire Settings → real `db_status` display (migration version + db path).
5. Tests: in-memory repository implementations pass the same contract
   test-suite you write once (`repositoryContract.ts`) — run it against
   the in-memory adapter in CI; document that the Tauri adapter gets the
   same suite in Phase 2 E2E.
6. Seed nothing. No demo data in the database by default.

## File boundaries

ONLY: `apps/clinic/src/data/**`, `apps/clinic/src/features/settings/**`
(db status section), `apps/clinic/src-tauri/src/commands/**`,
`apps/clinic/src-tauri/src/lib.rs` (command registration),
`apps/clinic/package.json`.

## Verification (run and report output)

```
cargo test --manifest-path apps/clinic/src-tauri/Cargo.toml
pnpm -C apps/clinic build
pnpm -C apps/clinic test
pnpm -C apps/clinic tauri build --debug   # verify command registration compiles
```

## Notes

- Domain types cross the bridge as plain JSON; timestamps stay ISO-8601
  UTC strings; money stays integer minor units end-to-end.
- Do not commit.
