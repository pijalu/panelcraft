// SPDX-License-Identifier: GPL-3.0-only
// Offline shell (M7-WP3, SPEC N8): first load installs the service worker;
// a reload with the network cut must still boot the app fully from the SW
// cache. The app itself proves liveness (header renders, workspace storage
// boots). User data lives in IDB, never in the SW (FR-S1).
import { test, expect, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';

/** Wait for an activated worker and its complete, content-versioned precache. */
async function expectInstalledShell(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active?.state !== 'activated') return false;
    const name = (await caches.keys()).find((key) => key.startsWith('panelcraft-shell-'));
    if (name === undefined) return false;
    const paths = (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname);
    return ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png'].every((path) => paths.includes(path))
      && paths.some((path) => path.endsWith('.js'))
      && paths.some((path) => path.endsWith('.css'));
  }), { timeout: 20_000 }).toBe(true);
}

// Both tests install/claim the same service worker in the same origin; running
// them concurrently races the precache (observed: `caches.keys()[0]` may be an
// empty cache left by the other test). Serial keeps the gate deterministic
// without retries (agents.md: no retries, fix the root cause).
test.describe.configure({ mode: 'serial' });

test('offline reload serves the app shell from the service worker', async ({ page }) => {
  await page.goto('/');

  // Activation alone is not the assertion: the executable shell must be cached.
  await expectInstalledShell(page);

  await page.reload();

  // cut the network entirely, then prove the app boots from cache
  await page.context().setOffline(true);
  await page.reload();

  const title = await page.title();
  expect(title).toBe('PanelCraft');
  await expect(page.locator('#app')).toBeVisible();
  // Prove the real application and a browser-local template work without a network.
  await expect(page.getByTestId('app-shell')).toBeVisible();
  const brandIcon = page.getByRole('img', { name: 'PanelCraft', exact: true });
  await expect(brandIcon).toBeVisible();
  await expect.poll(() => brandIcon.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(192);
  await expect(page.getByTestId('template-c4')).toBeVisible();
  await page.getByTestId('template-c4').click();
  const objects = page.getByTestId('canvas').locator('g.pc-obj');
  await expect(objects).toHaveCount(3);
  await expect(objects.filter({ hasText: 'Customer' })).toHaveCount(1);
  await expect(objects.filter({ hasText: 'Shop' })).toHaveCount(1);
  await expect(objects.filter({ hasText: 'Payment provider' })).toHaveCount(1);
  await openWorkspacePanels(page, ['code']);
  await expect(page.locator('.cm-content')).toContainText('Payment provider');
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
  for (const path of ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']) {
    expect(cached, `precache is missing ${path}`).toContain(path);
  }
  expect(cached.some((path) => path.endsWith('.js')), 'precache is missing executable JS').toBe(true);
  expect(cached.some((path) => path.endsWith('.css')), 'precache is missing the stylesheet').toBe(true);
});
