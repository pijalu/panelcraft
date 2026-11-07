// SPDX-License-Identifier: GPL-3.0-only
// S7 skeleton smoke (SPEC §3 S7, §8.6): the app loads and functions with ALL
// external requests blocked — the runtime proof of self-containment (N7/N11).
// Also asserts zero external requests are even attempted.
import { expect, test } from '@playwright/test';
import { capture } from './lib/screenshots';

const EXTERNAL = /^https?:\/\/(?!localhost|127\.0\.0\.1)/;

test('S7: app functions with external requests blocked (N7 runtime proof)', async ({
  page,
}) => {
  const blockedExternal: string[] = [];
  await page.route(EXTERNAL, (route) => {
    blockedExternal.push(route.request().url());
    return route.abort();
  });

  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.locator('.app-title')).toHaveText('PanelCraft');
  // M2 shell: all three regions render and function without any network
  await expect(page.getByTestId('palette')).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.getByTestId('properties')).toBeVisible();

  // Self-containment: the app must not even attempt external origins.
  expect(blockedExternal).toEqual([]);
});

test('S7 screenshots: light + dark baselines (vision-loop input, SPEC §8.4)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await capture(page, 'm0-light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'm0-dark');
});
