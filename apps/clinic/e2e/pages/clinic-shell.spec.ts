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

  await page.getByRole('button', { name: 'Owners & Patients' }).click()
  await expect(page.getByRole('heading', { name: 'Owners & patients' })).toBeVisible()

  await page.getByRole('button', { name: 'Appointments & Queue' }).click()
  await expect(page.getByRole('heading', { name: 'Appointments & Queue' })).toBeVisible()

  await page.getByRole('button', { name: 'Medical Records' }).click()
  await expect(page.getByRole('heading', { name: 'Medical Records' })).toBeVisible()

  // Consultation sits as a sub-item under Medical Records.
  await page.getByRole('button', { name: 'Consultation' }).click()
  await expect(page.getByRole('heading', { name: 'Consultation', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Pharmacy & Inventory' }).click()
  await expect(page.getByRole('heading', { name: 'Pharmacy & inventory' })).toBeVisible()

  await page.getByRole('button', { name: 'Billing & Payments' }).click()
  await expect(page.getByRole('heading', { name: 'Billing & payments' })).toBeVisible()

  await page.getByRole('button', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Report period' })).toBeVisible()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})

test('a persisted clinic document loads and survives a reload', async ({ page }) => {
  // Shell-level restart check (issue 0018): the web adapter persists one
  // document in localStorage; a stored document must win over the demo seed.
  // The renamed clinic proves hydration read the stored file, not the seed.
  // Minimal valid document — the same shape fixtures/clinic-document.json pins.
  const collections = [
    'users', 'owners', 'patients', 'appointments', 'encounters', 'products',
    'stockMovements', 'suppliers', 'inventoryItems', 'inventoryLots', 'invoices',
    'payments', 'vaccinations', 'caseTransfers', 'audit', 'outbox',
  ]
  const persisted = {
    clinic: { id: 'clinic-e2e', name: 'Reloaded Clinic', timezone: 'Asia/Bangkok', currency: 'THB', vatRate: 0.07 },
    ...Object.fromEntries(collections.map((key) => [key, []])),
  }
  await page.addInitScript((state) => {
    window.localStorage.setItem('clinicbook:state:v1', JSON.stringify(state))
  }, persisted)

  await page.goto('/')
  await expect(page.getByText('Reloaded Clinic').first()).toBeVisible()
  await page.reload()
  await expect(page.getByText('Reloaded Clinic').first()).toBeVisible()
})
