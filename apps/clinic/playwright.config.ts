import { defineConfig, devices } from '@playwright/test'

// Page tests: render each app view in a real browser against the Vite dev
// server. They exercise the shell + view wiring (nav, forms, tables) — not the
// Tauri shell, which stays covered by cargo tests.
export default defineConfig({
  testDir: './e2e/pages',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
