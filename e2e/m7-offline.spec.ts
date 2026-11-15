// SPDX-License-Identifier: GPL-3.0-only
// Offline shell (M7-WP3, SPEC N8): first load installs the service worker;
// a reload with the network cut must still boot the app fully from the SW
// cache. The app itself proves liveness (header renders, workspace storage
// boots). User data lives in IDB, never in the SW (FR-S1).
import { test, expect } from '@playwright/test';

// Both tests install/claim the same service worker in the same origin; running
// them concurrently races the precache (observed: `caches.keys()[0]` may be an
// empty cache left by the other test). Serial keeps the gate deterministic
// without retries (agents.md: no retries, fix the root cause).
test.describe.configure({ mode: 'serial' });

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

  const readCache = () => page.evaluate(async () => {
    // pick the app's cache by name, never by index (an empty stale cache can
    // be first), and report what was found for a readable failure
    const names = await caches.keys();
    const name = names.find((n) => n.toLowerCase().includes('panelcraft')) ?? names[0] ?? '';
    const cache = await caches.open(name);
    return { name, keys: (await cache.keys()).length };
  });
  // index.html + every hashed asset must be precached; CacheStorage visibility
  // is asynchronous in Chromium even after the worker becomes active.
  // UX08-WP04: the cache name carries the build's content hash, so a new build
  // always lands in a new cache and `activate` drops the previous shell.
  await expect.poll(async () => (await readCache()).name).toMatch(/^panelcraft-shell-[0-9a-f]{12}$/);
  await expect.poll(async () => (await readCache()).keys).toBeGreaterThanOrEqual(3);
  // The manifest, the app icons and the shell document travel with the bundle so
  // an installed app boots offline with its own identity.
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((n) => n.startsWith('panelcraft-shell-')) ?? '';
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  for (const path of ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']) {
    expect(cached, `precache is missing ${path}`).toContain(path);
  }
});
