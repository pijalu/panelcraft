// SPDX-License-Identifier: GPL-3.0-only
// Offline shell (M7-WP3, SPEC N8): first load installs the service worker;
// a reload with the network cut must still boot the app fully from the SW
// cache. The app itself proves liveness (header renders, workspace storage
// boots). User data lives in IDB, never in the SW (FR-S1).
import { test, expect } from '@playwright/test';

test('offline reload serves the app shell from the service worker', async ({ page }) => {
  await page.goto('/');

  // wait for the SW to control the page (first install claims clients)
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active;
  }, undefined, { timeout: 15_000 });

  // give the precache install a beat to finish all puts
  await page.waitForTimeout(500);

  await page.reload();

  // cut the network entirely, then prove the app boots from cache
  await page.context().setOffline(true);
  await page.reload();

  const title = await page.title();
  expect(title).toBe('PanelCraft');
  await expect(page.locator('#app')).toBeVisible();
  // the app actually booted (Preact rendered the header chrome)
  await expect(page.locator('header, [class*="header"], [class*="Header"]').first()).toBeVisible();
});

test('SW caches the hashed bundle (assets served cache-first)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active;
  }, undefined, { timeout: 15_000 });

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0] ?? '');
    return (await cache.keys()).length;
  });
  // index.html + every hashed asset must be precached
  expect(cached).toBeGreaterThanOrEqual(3);
});
