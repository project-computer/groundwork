import { expect, test } from '@playwright/test';

// Backend must be running: make dev-backend (port 8080)
test('backend health check', async ({ request }) => {
  const res = await request.get('http://localhost:8080/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});
