import { expect, test } from '@playwright/test';

test('loads login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Vite|Vet/i);
});
