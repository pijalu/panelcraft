// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig, devices } from '@playwright/test';

// Hosted smoke configuration (release gate). Runs the item 7–16 scenarios against
// the *deployed* site — no local web server, no preview bundle — so a green run is
// evidence about the hosted revision rather than about this working tree.
//
//   HOSTED_URL=https://pijalu.github.io/panelcraft/ \
//   EXPECTED_BUILD_SHA=<40-char sha> npm run e2e:hosted
//
// Two projects on purpose: `fresh` starts from an empty browser profile, and
// `upgrading` starts from a client that already has the service worker installed
// and then takes an update through the app's own Restart consent. A hard refresh
// is never evidence that caching is correct, so the two never share a project.
export default defineConfig({
  testDir: 'e2e-hosted',
  outputDir: 'test-results/hosted-artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A hosted run pays real network latency for every navigation.
  timeout: 120_000,
  reporter: process.env.CI
    ? [['github'], ['json', { outputFile: 'test-results/hosted/report.json' }]]
    : [['list'], ['json', { outputFile: 'test-results/hosted/report.json' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'fresh',
      testIgnore: /upgrading\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'upgrading',
      testMatch: /upgrading\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
