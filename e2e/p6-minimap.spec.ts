// SPDX-License-Identifier: GPL-3.0-only
// FR-C1: mini-map pointer/keyboard navigation, responsive hiding and themes.
import { expect, test } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0
system a "Client"
system b "API"
system c "Worker"
system d "Store"
a -> b : "request"
b -> c : "enqueue"
c -> d : "write"
layout saved
position a (40, 40)
position b (480, 60)
position c (80, 420)
position d (560, 440)
`;

test('FR-C1: mini-map pans by pointer and keyboard and tracks the viewport', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  const miniMap = page.getByTestId('mini-map');
  const indicator = page.getByTestId('mini-map-viewport');
  const world = page.locator('.pc-world');
  await expect(miniMap).toBeVisible();
  await expect(indicator).toBeVisible();
  const before = await world.getAttribute('transform');
  const box = await miniMap.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 25, box!.y + 25);
  await expect.poll(() => world.getAttribute('transform')).not.toBe(before);
  const panned = await indicator.getAttribute('style');
  await miniMap.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => indicator.getAttribute('style')).not.toBe(panned);
  await page.keyboard.press('Home');
  await page.getByTestId('collapse-code').click();
  await capture(page, 'p6-minimap-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'p6-minimap-dark');
});

test('FR-C1: mini-map yields to narrow canvases', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 720 });
  await page.goto('/');
  await expect(page.getByTestId('mini-map')).toBeHidden();
});
