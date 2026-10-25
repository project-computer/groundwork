import { expect, test } from '@playwright/test'

// Responsive regressions for the Appointments & Queue view. These assert
// layout behavior (agenda compaction, week columns, touch targets) rather than
// exact pixels, which the browser-mode screenshot tests cover separately.

async function openAppointments(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/')
  if (width <= 900) await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('button', { name: 'Appointments & Queue' }).click()
  await expect(page.getByRole('heading', { name: 'Appointments & queue' })).toBeVisible()
}

test('mobile day view collapses empty hours into an agenda', async ({ page }) => {
  await openAppointments(page, 390)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  const visibleHours = await page.locator('.cal-row:visible').count()
  expect(visibleHours).toBeGreaterThan(0)
  expect(visibleHours).toBeLessThan(11)

  const emptyVisible = await page.locator('.cal-row:visible').evaluateAll((rows) =>
    rows.filter((row) => row.querySelector('.cal-cells')?.childElementCount === 0).length,
  )
  expect(emptyVisible).toBe(0)

  // Status stays visible on phones (color alone is not enough).
  await expect(page.locator('.cal-appt .pill').first()).toBeVisible()

  const minHeight = await page
    .locator('.cal-actions button, .appointment-row .small-button')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height)
  expect(minHeight).toBeGreaterThanOrEqual(34)
})

test('week view is one column on phones and two on tablets', async ({ page }) => {
  await openAppointments(page, 390)
  await page.getByRole('tab', { name: 'Week' }).click()

  const mobileColumns = await page
    .locator('.week-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(mobileColumns).toBe(1)

  await openAppointments(page, 768)
  await page.getByRole('tab', { name: 'Week' }).click()

  const tabletColumns = await page
    .locator('.week-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(tabletColumns).toBe(2)
})

test('desktop keeps the hourly grid and seven-column week', async ({ page }) => {
  await openAppointments(page, 1280)

  expect(await page.locator('.cal-row:visible').count()).toBe(11)
  expect(await page.locator('.cal-row:visible .cal-cells:empty').count()).toBe(
    await page.locator('.cal-row:visible').count() - 4,
  )

  await page.getByRole('tab', { name: 'Week' }).click()
  const columns = await page
    .locator('.week-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(7)
})
