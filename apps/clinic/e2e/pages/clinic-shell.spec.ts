import { expect, test } from '@playwright/test'

// Page tests are intentionally minimal: they cover shell-level wiring only
// (app boots, nav mounts the right view). View behavior — forms, tables,
// search, mutations — is covered by component tests (vitest browser).

// The app is a single page with state-driven views (no router). Navigate by
// clicking the sidebar nav buttons.

test('app shell boots with dashboard', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await expect(page.getByText('Today’s appointments')).toBeVisible()
})

test('nav mounts each view', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Owners & Pets' }).click()
  await expect(page.getByRole('heading', { name: 'Owners & pets' })).toBeVisible()

  await page.getByRole('button', { name: 'Appointments & Queue' }).click()
  await expect(page.getByRole('heading', { name: 'Appointments & Queue' })).toBeVisible()

  await page.getByRole('button', { name: 'Medical Records' }).click()
  await expect(page.getByRole('heading', { name: 'Medical Records' })).toBeVisible()

  await page.getByRole('button', { name: 'Pharmacy & Inventory' }).click()
  await expect(page.getByRole('heading', { name: 'Pharmacy & inventory' })).toBeVisible()

  await page.getByRole('button', { name: 'Billing & Payments' }).click()
  await expect(page.getByRole('heading', { name: 'Billing & payments' })).toBeVisible()

  await page.getByRole('button', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Report period' })).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})
