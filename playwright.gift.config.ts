import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/gift',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 7000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5189/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'pnpm dev --port 5189 --strictPort',
    url: 'http://127.0.0.1:5189/',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
