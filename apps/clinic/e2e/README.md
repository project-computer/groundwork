# End-to-End Tests (reserved)

## Page tests (Playwright) — minimal by design

Page tests render the app in a real browser (Chromium) against the Vite dev
server. They cover **shell-level wiring only** — the app boots and each nav
item mounts its view. View behavior (forms, tables, search, mutations) is
covered by **component tests** (vitest browser mode), so keep this suite
small: if a test needs more than "goto → click nav → assert heading", it
probably belongs in a component test.


- Config: `apps/clinic/playwright.config.ts` (starts the dev server on port
  1420 automatically, reuses an already-running one locally)
- Tests: `apps/clinic/e2e/pages/*.spec.ts`

Run them:

```sh
pnpm test:pages                # from repo root
pnpm --filter @vet/clinic test:pages   # or from apps/clinic
pnpm --filter @vet/clinic exec playwright test --ui   # interactive UI mode
pnpm --filter @vet/clinic exec playwright test --headed e2e/pages/clinic-shell.spec.ts  # single file, visible browser
```

Notes:

- Fresh machine? Download the browser once: `pnpm exec playwright install chromium`.
- The app has **no router** — views are switched by clicking sidebar nav
  buttons (state-driven). Tests navigate via `getByRole('button', ...)`.
- Traces for failed runs are kept in `playwright-report/` / `test-results/`
  (gitignored).
- Full Tauri E2E (restart persistence, backup/restore) remains Phase 2+.

Intended Tauri E2E workflow test (Phase 2):

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
