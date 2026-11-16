// SPDX-License-Identifier: GPL-3.0-only
// Hosted smoke, upgrading context: an existing client with the service worker
// already installed. The question this answers is "which bundle is active?" — a
// hard refresh is not evidence, so the cached shell's own identity is read back
// and compared with the deployment's, online and then offline.
//
// The update/restart lifecycle (a byte-different worker arrives, the offer waits,
// Restart flushes and reloads once) cannot be staged against Pages: the deployed
// worker script is not writable. It is rehearsed against the same built bundle by
// `e2e/ux08-pwa.spec.ts`, which rewrites the served `sw.js` — the faithful
// stand-in for a deploy — and is part of the release gate battery.
import { expect, test } from '@playwright/test';
import { HOSTED_URL, servedBuildInfo, shoot } from './lib/hosted';

/** True once a worker controls this page (i.e. this is no longer a first visit). */
async function controlled(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => navigator.serviceWorker.controller !== null);
}

/** The `<meta name="panelcraft-build">` of the shell inside the worker's cache. */
async function cachedShellShortSha(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(async () => {
    const shell = new URL('index.html', document.baseURI).href;
    const hit = await caches.match(shell);
    if (hit === undefined) return null;
    const html = await hit.text();
    return /<meta name="panelcraft-build" content="([^"]+)"/.exec(html)?.[1] ?? null;
  });
}

test.describe('upgrading client', () => {
  test('the installed shell is the deployed revision, online and offline', async ({ page, context }) => {
    const info = await servedBuildInfo(page);

    // First visit: the worker installs, precaches, and takes control of the next
    // navigation. Wait for `active` and let the precache settle — the offline
    // step below is only meaningful once every shell file is really cached.
    await page.goto(HOSTED_URL);
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration())?.active != null,
      null,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    expect(await controlled(page), 'a worker controls the reloaded page').toBe(true);

    // Which bundle is active: the shell the worker serves is the deployment's.
    expect(await cachedShellShortSha(page)).toBe(info.shortSha);
    const caches_ = await page.evaluate(() => caches.keys());
    expect(caches_.filter((name) => name.startsWith('panelcraft-shell-'))).toHaveLength(1);
    await shoot(page, 'hosted-upgrading-controlled');

    // No update is pending: this client is on the revision under test, not on a
    // stale copy that merely looks like it.
    await expect(page.getByTestId('banner-update')).toHaveCount(0);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? '');
    expect(scope).toBe(new URL(HOSTED_URL).href);

    // Offline: the cached shell boots the same revision — the honest proof that
    // the active bundle is the deployment and not a stray network response.
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    expect(await page.locator('meta[name="panelcraft-build"]').getAttribute('content')).toBe(info.shortSha);
    expect(await cachedShellShortSha(page)).toBe(info.shortSha);
    await shoot(page, 'hosted-upgrading-offline');
    await context.setOffline(false);

    // Back online the client keeps its controller and stays on the same build.
    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    expect(await controlled(page)).toBe(true);
    expect(await page.locator('meta[name="panelcraft-build"]').getAttribute('content')).toBe(info.shortSha);
  });
});
