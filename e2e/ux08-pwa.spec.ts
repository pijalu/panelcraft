// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: the update contract in a real browser. A new shell must never take
// over on its own: it waits, the app offers "Update available", Later keeps the
// offer, playback queues it, and Restart flushes storage and reloads exactly once.
//
// A new build is simulated by rewriting the registration's worker script and
// forcing an update check: the browser installs the byte-different script as
// `waiting`. That exercises the same lifecycle a real deploy does without a
// second build artifact.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openFlowSteps, openWorkspacePanels, setAppTheme } from './lib/panels';
import { capture } from './lib/screenshots';

/** A document with one playable flow: enough to start playback from Flows. */
const FLOW_DOC = `pcd 1.0

person ada "Ada"
system web "Web"

ada -> web as aw

flow "Checkout" as main {
  intro "Kick off"
  ada -> web : "send"
  conclusion "done"
}
`;

/** Paste into the code view and wait until the document settles. */
async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  // A "returning visit": the shell is already installed *and* has claimed this
  // page. Only a controlled page can be updated — on the very first visit the
  // worker activates immediately instead of waiting, so there is nothing to
  // offer and the update contract does not apply.
  await page.waitForFunction(
    async () => {
      if (navigator.serviceWorker.controller === null) return false;
      return (await navigator.serviceWorker.getRegistration())?.active != null;
    },
    undefined,
    { timeout: 20_000 },
  );
}

const BUILT_WORKER = join('web', 'dist', 'sw.js');
const originalWorker = readFileSync(BUILT_WORKER, 'utf8');
/** What the server currently serves; each stage appends one more build marker. */
let servedWorker = originalWorker;
let builds = 0;

/**
 * Stage a second build of the worker and make the browser fetch it — exactly what
 * a deploy does: byte-different script + same scope ⇒ the browser installs it as
 * `waiting`. Playwright cannot intercept service-worker script fetches, blob:
 * workers are rejected, and the preview server caches its file list at startup,
 * so rewriting the served script is the faithful path.
 *
 * `register()` alone is not enough: the browser throttles an update check that
 * follows the registration/claim this page just performed, so the fresh bytes
 * are never fetched. `update()` forces the check, which is what a later visit
 * (or the browser's own periodic check) does in production.
 *
 * Every stage must differ from what the *previous test* left behind (the tests
 * share one server and one dist), hence the incrementing build marker.
 */
async function stageUpdate(page: Page): Promise<void> {
  builds += 1;
  servedWorker = `${servedWorker}\n// staged build ${builds}\n`;
  writeFileSync(BUILT_WORKER, servedWorker);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) throw new Error('no registration to update');
    await registration.update();
  });
}

test.afterAll(() => {
  writeFileSync(BUILT_WORKER, originalWorker);
});

test.describe.configure({ mode: 'serial' });

test('an update waits, offers a restart, and Later keeps the offer', async ({ page }) => {
  await ready(page);
  // No offer before a new worker exists.
  await expect(page.getByTestId('banner-update')).toHaveCount(0);

  await stageUpdate(page);
  await expect(page.getByTestId('banner-update')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('banner-update')).toContainText('Update available');

  // Vision review evidence (STYLE-GUIDE checklist): the offer in both themes and
  // the menu entry that keeps it reachable after Later.
  for (const scheme of ['light', 'dark'] as const) {
    await setAppTheme(page, scheme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    await capture(page, `ux08-update-banner-${scheme}`);
  }
  await setAppTheme(page, 'system');

  // Later hides the banner without activating anything: the page keeps its
  // controller and the menu still offers the restart.
  await page.getByTestId('update-later').click();
  await expect(page.getByTestId('banner-update')).toHaveCount(0);
  await page.getByTestId('app-menu').click();
  await expect(page.getByTestId('app-update-restart')).toBeVisible();
  await capture(page, 'ux08-app-menu-update');
  await page.keyboard.press('Escape');
});

test('Restart flushes the workspace, activates the worker and reloads once', async ({ page }) => {
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await ready(page);

  // Work that must survive the reload: add a shape. Drag-drop, not a plain
  // click: the palette deliberately fires click-to-place *and* drag-drop, so a
  // click would insert two objects (S1 pattern, see s2-code).
  const item = page.getByTestId('palette-system');
  const box = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const canvas = page.getByTestId('canvas');
  const target = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 320, target.y + 240, { steps: 8 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1);
  const countBefore = navigations.length;

  await stageUpdate(page);
  await expect(page.getByTestId('banner-update')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('update-restart').click();

  // Exactly one navigation: the reload that follows controllerchange.
  await expect
    .poll(() => navigations.length, { timeout: 15_000 })
    .toBe(countBefore + 1);
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  // The flushed workspace came back with the object still in the document.
  await expect(page.locator('svg[data-testid="canvas"] g.pc-obj')).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(navigations.length).toBe(countBefore + 1);
});

test('playback queues the offer instead of interrupting the flow', async ({ page }) => {
  await ready(page);
  await seedDoc(page, FLOW_DOC);
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('flow-play-main').click();
  await expect(page.getByTestId('playbar')).toBeVisible();

  await stageUpdate(page);
  // The browser did install the new worker while the flow was playing — ground
  // truth from the registration — but no offer interrupts playback.
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistration())?.waiting != null,
    undefined,
    { timeout: 15_000 },
  );
  await expect(page.getByTestId('banner-update')).toHaveCount(0);
  await expect(page.getByTestId('playbar')).toBeVisible();

  // Ending playback surfaces the queued offer.
  await page.getByTestId('pb-exit').click();
  await expect(page.getByTestId('banner-update')).toBeVisible({ timeout: 15_000 });
});

// Installability (SPEC FR-S3): a browser needs a manifest it can parse, icons it
// can fetch, and a theme colour to install the app as a window. Runs standalone
// so it does not share the staged worker the update tests leave behind.
test.describe('installability', () => {
  test.describe.configure({ mode: 'default' });

  test('the manifest, icons and theme colour are installable', async ({ page, request, context }) => {
    await page.goto('/');
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();

    // Chromium's own installability verdict: a manifest Chromium can parse and
    // no blocking errors (icons, start_url, display).
    const cdp = await context.newCDPSession(page);
    const appManifest = await cdp.send('Page.getAppManifest');
    expect(appManifest.url).toContain('/manifest.webmanifest');
    expect(appManifest.errors).toEqual([]);
    const installability = (await cdp.send('Page.getInstallabilityErrors')) as {
      installabilityErrors: { errorId: string }[];
    };
    expect(installability.installabilityErrors).toEqual([]);

    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveAttribute('href', './manifest.webmanifest');
    const href = (await link.getAttribute('href')) ?? '';
    const manifestUrl = new URL(href, page.url()).href;

    const response = await request.get(manifestUrl);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(manifest.name).toBe('PanelCraft');
    // Relative URLs: the same bundle installs from / and from a sub-path.
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');

    // Chromium's install criteria: a 192px and a 512px icon, both fetchable.
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((entry) => entry.sizes.includes(size));
      expect(icon, `manifest icon ${size}`).toBeDefined();
      const iconResponse = await request.get(new URL(icon!.src, manifestUrl).href);
      expect(iconResponse.status(), icon!.src).toBe(200);
      expect(iconResponse.headers()['content-type']).toContain('image/png');
    }

    // The window chrome colour follows the OS setting; both are declared.
    const colours = await page
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) => metas.map((meta) => meta.getAttribute('content')));
    expect(colours).toHaveLength(2);
    for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });
});
