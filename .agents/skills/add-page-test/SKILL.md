---
name: add-page-test
description: Add a Playwright page test for the VetCare clinic app. Page tests are minimal — shell wiring only. Use when the user asks to add or extend page tests or browser tests for the clinic UI.
---

# Add Page Test

**This suite is intentionally minimal.** Page tests exist to verify shell-level
wiring in a real browser: the app boots, and each nav item mounts its view.
Anything deeper — forms, tables, search, mutations, per-view interactions —
belongs in **component tests** (vitest browser mode, next to the component in
`src/`). If a proposed page test needs more than `goto('/') → click nav →
assert heading`, stop and suggest a component test instead.

Page tests live in `apps/clinic/e2e/pages/*.spec.ts`, run with
`@playwright/test` against the Vite dev server (config:
`apps/clinic/playwright.config.ts`). The Tauri shell itself is covered by
cargo tests.

## Before writing

1. Run `pnpm test:pages` first to confirm a green baseline.
2. Check `clinic-shell.spec.ts` — if the view is already covered, stop.

## Writing the test

Only two patterns are allowed:

1. **Boot** — app shell renders on `/`.
2. **Nav mounts view** — click a nav button, assert the view's heading.

```ts
import { expect, test } from '@playwright/test'

test('nav mounts <view>', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '<nav label>' }).click()
  await expect(page.getByRole('heading', { name: '<view heading>' })).toBeVisible()
})
```

Conventions:

- Keep all nav/view coverage in `clinic-shell.spec.ts` unless the user asks
  for a separate file.
- Navigation labels come from the `nav` array in `clinic-shell.tsx`
  (Dashboard, Appointments & Queue, Owners & Pets, Medical Records,
  Pharmacy & Inventory, Billing & Payments, Reports, Staff & Permissions,
  Settings). View headings come from each view's `PageHeader`.
- Copy user-visible text **exactly** — the app uses typographic apostrophes
  (`Today’s appointments`), not `'`.
- Use role/label queries (`getByRole`, `getByText`), never CSS selectors.
- New views: add one `test('nav mounts <view>')` block to
  `clinic-shell.spec.ts` — nothing more.

## Verify

```sh
pnpm --filter @vet/clinic test:pages        # run all page tests
pnpm --filter @vet/clinic exec playwright test e2e/pages/<file>.spec.ts   # just the new file
```

All tests must pass before finishing. If the dev server port 1420 is busy, Playwright reuses the running instance.

## Reference

- How to run + notes: `apps/clinic/e2e/README.md`
- Config: `apps/clinic/playwright.config.ts`
