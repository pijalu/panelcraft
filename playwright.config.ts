// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig, devices } from '@playwright/test';

// E2E config (SPEC §8.3). Serve the built bundle (npm run build first —
// same contract as the Go embed). Chromium only; scenarios S1–S7 map to
// docs/SPEC.md §3.
export default defineConfig({
  testDir: 'e2e',
  // F-09: run artifacts (screenshots, traces, diffs) go to the gitignored
  // test-results/ dir — a full e2e run must leave `git status` clean.
  outputDir: 'test-results/artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // agents.md: no retries — flaky = fix root cause
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
