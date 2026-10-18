# End-to-End Tests (reserved)

E2E coverage starts in Phase 2 with Playwright against the Tauri desktop
shell (and later the web target).

Intended workflow test:

1. Create an owner.
2. Register a pet.
3. Create an appointment.
4. Open a visit.
5. Add medical notes.
6. Add billable items.
7. Record payment.
8. Generate a receipt.
9. Close and restart the application.
10. Verify that the records remain available.

Plus: backup and restore against a disposable test database (Phase 3).

Unit/integration layers that already exist:

- `src/domain/*.test.ts`, `src/validation/*.test.ts`, `src/data/*.test.ts`
  — run with `pnpm -C apps/clinic test`.
- `src-tauri/tests/*.rs` — run with
  `cargo test --manifest-path apps/clinic/src-tauri/Cargo.toml`.
