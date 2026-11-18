// SPDX-License-Identifier: GPL-3.0-only
// Dedicated presentation URL anchor. Real Chromium history and IDB: a link
// addresses an authored flow in the reader's own restored active file, so each
// scenario seeds that file first. The hash is never document input; every test
// compares the code view before and after and rejects external requests.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system shop "Shop"

ada -> shop : "browses"

flow "Checkout" as checkout {
  intro "Kick off"
  ada -> shop : "pay"
  conclusion "done"
}
`;

const NO_ID_DOC = `pcd 1.0

person ada "Ada"
system shop "Shop"

ada -> shop : "browses"

flow "Local" {
  intro "Kick off"
  ada -> shop : "pay"
}
`;

const ANCHOR = '#present=checkout';

/** Collect every request that leaves the app's own origin. */
function watchExternal(page: Page): () => string[] {
  const found: string[] = [];
  const origin = 'http://localhost:4173';
  page.on('request', (request) => {
    const url = request.url();
    if (/^(data|blob|about):/.test(url)) return;
    if (new URL(url).origin !== origin) found.push(url);
  });
  return () => found;
}

async function seed(page: Page, doc = DOC): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page, ['code']);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(doc);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 10_000,
  });
}

/** Code-view text, i.e. exactly what a save would write. */
async function docText(page: Page): Promise<string> {
  await expect(page.locator('.cm-content')).toContainText('pcd 1.0');
  const lines = await page.locator('.cm-content .cm-line').allInnerTexts();
  return lines.join('\n');
}

async function hashOf(page: Page): Promise<string> {
  return page.evaluate(() => window.location.hash);
}

async function presenting(page: Page): Promise<boolean> {
  return (await page.getByTestId('app-shell').getAttribute('data-presenting')) === 'true';
}

async function presentFromLauncher(page: Page, key: string): Promise<void> {
  await page.getByTestId('present-open').click();
  await expect(page.getByTestId('present-launcher')).toBeVisible();
  await page.getByTestId(`launcher-flow-${key}`).click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
}

async function exitPresent(page: Page): Promise<void> {
  await page.getByTestId('present-exit').click();
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
}

test.describe('dedicated presentation URL anchor', () => {
  test('Present publishes the hash; reload and Back/Forward follow it; exit clears it', async ({ page }) => {
    const external = watchExternal(page);
    await seed(page);
    await page.emulateMedia({ colorScheme: 'light' });
    const before = await docText(page);

    await presentFromLauncher(page, 'checkout');
    await expect.poll(() => hashOf(page)).toBe(ANCHOR);
    await expect(page.getByTestId('present-notes')).toContainText('Kick off');
    // Let the beat's camera glide settle before the visual capture.
    await page.waitForTimeout(450);
    await capture(page, 'present-hash-explicit-light');

    // A reload is a fresh app boot from restored storage with the same link.
    await page.reload();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
    await expect.poll(() => hashOf(page)).toBe(ANCHOR);
    await expect(page.getByTestId('present-counter')).toContainText('1');

    // Back leaves presentation; Forward re-opens the same flow from the link.
    await page.goBack();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
    await expect.poll(() => hashOf(page)).toBe('');
    await page.goForward();
    await expect.poll(() => hashOf(page)).toBe(ANCHOR);
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');

    await exitPresent(page);
    await expect.poll(() => hashOf(page)).toBe('');
    expect(await docText(page), 'presenting never rewrites the file').toBe(before);
    expect(external(), 'no external request').toEqual([]);
  });

  test('direct load with a link starts from restored storage, including under the service worker', async ({ page }) => {
    const external = watchExternal(page);
    await seed(page);
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg?.active);
    }, undefined, { timeout: 15_000 });
    const before = await docText(page);
    await page.emulateMedia({ colorScheme: 'dark' });

    // A different query forces a document load (a hash-only goto would be a
    // same-document navigation and would not test startup at all).
    await page.goto(`/?direct=1${ANCHOR}`);
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
    await expect(page.getByTestId('present-dock')).toBeVisible();
    await expect(page.getByTestId('present-notes')).toContainText('Kick off');
    await expect.poll(() => hashOf(page)).toBe(ANCHOR);
    // Let the beat's camera glide settle before the visual capture.
    await page.waitForTimeout(450);
    await capture(page, 'present-hash-direct-dark');

    await exitPresent(page);
    expect(await docText(page)).toBe(before);
    expect(external(), 'no external request').toEqual([]);
  });

  test('unknown, malformed and foreign anchors fall back without touching the file', async ({ page }) => {
    await seed(page);
    const before = await docText(page);
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['#present=nope', ''], // no such authored id
      ['#present=%ZZ', ''], // broken percent escape
      ['#present=a&view=b', ''], // forged multi-key fragment
      ['#present=', ''], // empty value
      ['#view=main', '#view=main'], // not ours: leave it alone
    ];
    for (const [i, [fragment, expected]] of cases.entries()) {
      await page.goto(`/?bad=${i}${fragment}`);
      await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
      await expect.poll(() => hashOf(page), fragment).toBe(expected);
      expect(await docText(page), `${fragment} must not change the file`).toBe(before);
    }
  });

  test('a flow without an authored id has no link; a stale anchor cannot survive a file switch', async ({ page }) => {
    await seed(page, NO_ID_DOC);
    const before = await docText(page);
    await presentFromLauncher(page, 'Local');
    await expect.poll(() => hashOf(page)).toBe('');
    await exitPresent(page);

    // A second file supplies the switch below. Creating a file activates it, so
    // land back on the document under test first: the click that follows must be
    // a real file change, not a no-op that would leave the anchor in place.
    await openWorkspacePanels(page, ['sidebar']);
    await page.getByTestId('tree-new-file').click();
    await page.getByTestId('tree-create-input').fill('other.pcd');
    await page.getByTestId('tree-create-input').press('Enter');
    await expect(page.getByTestId('tab-other.pcd')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('pcd 1.0');
    await page.getByTestId('tab-untitled.pcd').click();
    await expect.poll(() => hashOf(page)).toBe('');
    // Poll rather than read once: the editor re-renders the buffer after a switch.
    await expect
      .poll(() => docText(page), { message: 'creating a file never rewrites the other one' })
      .toBe(before);

    // Put an anchor in the URL silently (pushState/replaceState fire no event),
    // then switch files: a stale link must not outlive its document.
    await page.evaluate((hash) => {
      window.history.replaceState(null, '', window.location.pathname + hash);
    }, ANCHOR);
    await expect.poll(() => hashOf(page)).toBe(ANCHOR);

    await page.getByTestId('tab-other.pcd').click();
    await expect.poll(() => hashOf(page)).toBe('');
    expect(await presenting(page)).toBe(false);

    await page.getByTestId('tab-untitled.pcd').click();
    await expect
      .poll(() => docText(page), { message: 'file switch never rewrites the file' })
      .toBe(before);
  });
});
