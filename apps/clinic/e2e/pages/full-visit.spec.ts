import { expect, test } from '@playwright/test'

// Release-gate scenarios (plan §8, issue 0018, P1-12): the clinic-day flow
// through the real web UI — register, walk-in, consult, prescribe, invoice,
// partial payment, receipt, and restart persistence. The page suite stays
// intentionally thin: these are the few flows worth driving through the
// browser at all; everything else lives in component tests.

const signInAs = async (page: import('@playwright/test').Page, name: string) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Staff & Permissions' }).click()
  await page.locator('.staff-table .table-row', { hasText: name }).getByRole('button', { name: /Sign in as/ }).click()
  await expect(page.getByRole('main').getByText(name).first()).toBeVisible()
}

test('a full clinic visit: check-in → consult → prescribe → invoice → partial payment → receipt → restart', async ({ page }) => {
  await signInAs(page, 'Nok Srisuk') // reception handles billing

  // Start the checked-in visit (Moo Daeng).
  await page.getByRole('button', { name: 'Appointments & Queue' }).click()
  await page.getByRole('button', { name: /Start/ }).first().click()
  await expect(page.getByText('Clinical record for Moo Daeng')).toBeVisible()

  // Vitals.
  await page.locator('#vt-weight').fill('28.4')
  await page.locator('#vt-temp').fill('38.9')
  await page.getByRole('button', { name: 'Record vitals' }).click()

  // Diagnosis.
  await page.locator('#dx-text').fill('Acute otitis externa, left ear')
  await page.getByRole('button', { name: 'Add diagnosis' }).click()
  await expect(page.getByText('Acute otitis externa, left ear')).toBeVisible()

  // Prescription from the pharmacy catalog.
  await page.locator('#rx-item').selectOption('it-2')
  await page.locator('#rx-dose').fill('10 mg/kg')
  await page.getByRole('button', { name: 'Add prescription' }).click()
  await expect(page.locator('.rx-row strong', { hasText: 'Amoxicillin 250 mg tablet' })).toBeVisible()

  // Close → draft invoice → billing.
  await page.getByRole('button', { name: 'Close consultation' }).click()
  await expect(page.getByText('Consultation closed')).toBeVisible()
  await expect(page.getByText('INV-2026-0143')).toBeVisible()
  await page.getByRole('button', { name: 'Go to billing' }).click()

  // Post the draft, then pay part of the balance.
  const invoiceRow = page.locator('.billing-table .table-row', { hasText: 'INV-2026-0143' })
  await page.getByRole('button', { name: 'Post invoice' }).click()
  await invoiceRow.getByRole('button', { name: 'Record payment' }).click()
  await page.locator('#pay-amount').fill('300')
  await page.locator('.modal .button.primary').click()
  await expect(page.getByText('฿251.05')).toBeVisible() // remaining balance

  // Settle the rest — defaults to the outstanding balance.
  await invoiceRow.getByRole('button', { name: 'Record payment' }).click()
  await expect(page.locator('#pay-amount')).toHaveValue('251.05')
  await page.locator('.modal .button.primary').click()
  await expect(page.locator('.pill', { hasText: 'paid' }).first()).toBeVisible()

  // Printable receipt.
  await invoiceRow.getByRole('button', { name: 'Receipt' }).click()
  await expect(page.getByText('Invoice / Receipt')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Baan Sathorn Animal Clinic' })).toBeVisible()

  // Restart persistence (plan §8): reload and the clinic document survives.
  await page.reload()
  await expect(page.getByRole('button', { name: /Manage Baan Sathorn/ })).toBeVisible()
  await page.getByRole('button', { name: 'Billing & Payments' }).click()
  await expect(page.getByRole('main').getByText('INV-2026-0143').first()).toBeVisible()
})

test('a walk-in appears in the waiting queue and starts a consultation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Appointments & Queue' }).click()

  await page.getByRole('button', { name: 'Add walk-in' }).click()
  await page.locator("select[aria-label='Walk-in patient']").selectOption('p-2')
  await page.locator("input[aria-label='Walk-in reason']").fill('Skin check')
  await page.locator('.walkin-form .button.primary').click()
  await expect(page.locator('.appointment-row', { hasText: 'Khao Niao' })).toBeVisible()

  await page.locator('.appointment-row', { hasText: 'Khao Niao' }).getByRole('button', { name: /Start/ }).click()
  await expect(page.getByText('Clinical record for Khao Niao')).toBeVisible()
})

test('registering an owner and patient survives a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Owners & Patients' }).click()
  await page.getByRole('button', { name: 'Register Patient' }).click()

  await page.locator('#owner').fill('Anong Srisuk')
  await page.locator('#patient').fill('Milo')
  await page.locator('#microchip').fill('988100011122333')
  await page.getByRole('button', { name: 'Save Records' }).click()
  await expect(page.getByText('Milo registered.')).toBeVisible()
  await expect(page.getByText('PT-2026-0006')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Owners & Patients' }).click()
  await expect(page.getByRole('main').getByText('Milo').first()).toBeVisible()
})

test('a receptionist cannot perform admin-only exports', async ({ page }) => {
  await signInAs(page, 'Nok Srisuk') // reception: no staff.manage, no data.export
  await page.getByRole('button', { name: /Settings/ }).click()
  await expect(page.getByRole('main').getByText('Portability & recovery')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Export records' })).toBeDisabled()
})
