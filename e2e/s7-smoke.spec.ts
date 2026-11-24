// SPDX-License-Identifier: GPL-3.0-only
// S7 skeleton smoke (SPEC §3 S7, §8.6): the app loads and functions with ALL
// external requests blocked — the runtime proof of self-containment (N7/N11).
// Also asserts zero external requests are even attempted.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const EXTERNAL = /^https?:\/\/(?!localhost|127\.0\.0\.1)/;

async function expectHeaderActions(page: Page): Promise<void> {
  const present = page.getByTestId('present-open');
  const menu = page.getByTestId('app-menu');
  await expect(present).toHaveText('');
  await expect(present).toHaveAttribute('aria-label', 'Present a flow');
  await expect(present).toHaveAttribute('title', 'Present a flow');
  await expect(present.locator('svg')).toBeVisible();
  await expect(page.locator('.app-header button').last()).toHaveAttribute('data-testid', 'app-menu');
  const presentBox = await present.boundingBox();
  const menuBox = await menu.boundingBox();
  const headerBox = await page.locator('.app-header').boundingBox();
  if (presentBox === null || menuBox === null || headerBox === null) throw new Error('header geometry is unavailable');
  expect(presentBox.x + presentBox.width).toBeLessThanOrEqual(menuBox.x);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width);
}

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
  await expect(page.locator('.app-title')).toHaveAttribute('aria-hidden', 'true');
  const brandIcon = page.getByRole('img', { name: 'PanelCraft', exact: true });
  await expect(brandIcon).toBeVisible();
  await expect(brandIcon).toHaveAttribute('src', './icons/icon-192.png');
  await expect(brandIcon).toHaveAttribute('alt', 'PanelCraft');
  await expect.poll(() => brandIcon.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(192);
  const iconBox = await brandIcon.boundingBox();
  const titleBox = await page.locator('.app-title').boundingBox();
  if (iconBox === null || titleBox === null) throw new Error('brand geometry is unavailable');
  expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(titleBox.x);
  expect(Math.abs(iconBox.y + iconBox.height / 2 - titleBox.y - titleBox.height / 2)).toBeLessThanOrEqual(1);
  await expect(page.locator('.app-title-accent')).toHaveText('Craft');
  await expect(page.locator('.app-title-accent')).toHaveCSS('background-image', /linear-gradient/);
  await expectHeaderActions(page);
  // Fresh workspace: the source opens beside the canvas and every other panel
  // stays available as a rail that consumes no canvas space.
  await expect(page.getByTestId('code-pane')).toBeVisible();
  for (const panel of ['sidebar', 'flows', 'palette', 'props']) {
    await expect(page.getByTestId(`rail-${panel}`)).toBeVisible();
  }
  await expect(page.getByTestId('palette')).toHaveCount(0);
  await expect(page.getByTestId('canvas')).toBeVisible();
  await openWorkspacePanels(page, ['palette', 'props']);
  await expect(page.getByTestId('properties')).toBeVisible();

  // Self-containment: the app must not even attempt external origins.
  expect(blockedExternal).toEqual([]);
});

test('S7: narrow header keeps the named brand icon and rightmost controls', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto('/');
  await expect(page.locator('.app-title')).toBeHidden();
  await expect(page.getByRole('img', { name: 'PanelCraft', exact: true })).toBeVisible();
  await expectHeaderActions(page);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  await capture(page, 'header-narrow-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'header-narrow-dark');

  await page.setViewportSize({ width: 720, height: 720 });
  await expect(page.locator('.app-title')).toBeVisible();
  await expect(page.getByRole('img', { name: 'PanelCraft', exact: true })).toBeVisible();
  await expectHeaderActions(page);
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
