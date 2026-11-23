// SPDX-License-Identifier: GPL-3.0-only
// Fresh profiles expose the two halves of the authoring model together. These
// scenarios intentionally exercise the new visible-Code contract; saved pane
// choices remain authoritative and narrow screens keep their accessible drawer.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { chooseAppMenu, choosePanelMenu } from './lib/panels';
import { documentText, normalise, seedCode } from './lib/seed';

const DOC = `pcd 1.0

system api "API Gateway"
datastore store "Main store"

api -> store : "writes"
`;

async function boot(page: Page, colorScheme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme });
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
}

async function expectUsableSplit(page: Page): Promise<void> {
  const canvas = await page.getByTestId('canvas').boundingBox();
  const code = await page.getByTestId('code-pane').boundingBox();
  if (canvas === null || code === null) throw new Error('fresh canvas/code split is unavailable');
  expect(canvas.width).toBeGreaterThanOrEqual(320);
  expect(code.width).toBeGreaterThanOrEqual(260);
  expect(code.x).toBeGreaterThanOrEqual(canvas.x + canvas.width);
}

async function scan(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

/** Measure from the real quick-add key event to the visible source mutation. */
async function observeNextSourceUpdate(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = document.querySelector('.cm-content');
    if (editor === null) throw new Error('code editor is not mounted');
    let startedAt: number | null = null;
    const observer = new MutationObserver(() => {
      if (startedAt === null || !editor.textContent?.includes('Person 1')) return;
      document.documentElement.dataset.codeSyncMs = String(performance.now() - startedAt);
      observer.disconnect();
    });
    observer.observe(editor, { subtree: true, childList: true, characterData: true });
    window.addEventListener('keydown', (event) => {
      if (event.key === '1') startedAt = performance.now();
    }, { once: true });
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`fresh drawing shows editable Code and synchronizes objects, links and history (${colorScheme})`, async ({ page }) => {
    await boot(page, colorScheme);
    const canvas = page.getByTestId('canvas');
    const editor = page.locator('.cm-content');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-panels', /code:open/);
    await expect(page.getByTestId('code-pane')).toBeVisible();
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await expectUsableSplit(page);
    await capture(page, `code-default-fresh-${colorScheme}`);
    await scan(page);

    await canvas.click({ position: { x: 180, y: 160 } });
    await observeNextSourceUpdate(page);
    await page.keyboard.press('1');
    await expect(canvas.locator('.pc-obj[data-id="o1"]')).toBeVisible();
    await expect.poll(() => page.locator('html').getAttribute('data-code-sync-ms')).not.toBeNull();
    const elapsed = Number(await page.locator('html').getAttribute('data-code-sync-ms'));
    // The machine schedules exactly 150 ms; allow rendering and CI task latency.
    expect(elapsed).toBeLessThan(350);
    await test.info().attach('canvas-to-code-elapsed', {
      contentType: 'application/json',
      body: JSON.stringify({ elapsedMs: elapsed, configuredDebounceMs: 150 }),
    });
    await expect(editor).toContainText('Person 1');

    await page.keyboard.press('2');
    await expect(canvas.locator('.pc-obj[data-id="o2"]')).toBeVisible();
    await expect(editor).toContainText('System 1');
    // Quick-add places each shape at the canvas centre: move the second one
    // clear of the first so it can be linked.
    const second = await canvas.locator('.pc-obj[data-id="o2"]').boundingBox();
    if (second === null) throw new Error('second object is unavailable');
    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width / 2 + 340, second.y + second.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
    await canvas.locator('.pc-obj[data-id="o1"]').click();
    const halo = await canvas.locator('.pc-halo[data-side="right"]').first().boundingBox();
    const target = await canvas.locator('.pc-obj[data-id="o2"]').boundingBox();
    if (halo === null || target === null) throw new Error('connection endpoints are unavailable');
    await page.mouse.move(halo.x + halo.width / 2, halo.y + halo.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(canvas.locator('g.pc-link')).toHaveCount(1);
    await expect(editor).toContainText('o1 -> o2');
    await capture(page, `code-default-drawing-${colorScheme}`);

    await canvas.focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(canvas.locator('g.pc-link')).toHaveCount(0);
    await expect(editor).not.toContainText('o1 -> o2');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(canvas.locator('g.pc-link')).toHaveCount(1);
    await expect(editor).toContainText('o1 -> o2');

    // The drawn connection is a presentable Default flow without any authoring.
    await page.getByTestId('expand-flows').click();
    await expect(page.getByTestId('flow-pane')).toBeVisible();
    await expect(page.getByTestId('flow-empty')).toHaveCount(0);
    await expect(page.getByTestId('flow-derived-hint')).toBeVisible();
    await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
    await expect(page.getByTestId('flow-steps')).toContainText('Person 1 → System 1');
    await capture(page, `code-default-drawn-flow-${colorScheme}`);
    await page.getByTestId('collapse-flows').click();
    await page.getByTestId('present-open').click();
    await expect(page.getByTestId('launcher-derived-default')).toBeVisible();
    await expect(page.getByTestId('launcher-flow-default')).toContainText('1 step');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
  });
}

test('code-to-canvas sync and diagnostics survive Code collapse and reopen', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('code-pane')).toBeVisible();
  await seedCode(page, DOC);
  await expect(page.locator('.pc-obj[data-id="api"]')).toBeVisible();
  await expect(page.locator('.pc-obj[data-id="store"]')).toBeVisible();
  await expect(page.locator('g.pc-link')).toHaveCount(1);

  const broken = 'pcd 1.0\nsystem api "API Gateway" bogusattr\n';
  await seedCode(page, broken, { sync: 'error' });
  await expect(page.getByTestId('diag-count')).toHaveText('1');
  await expect(page.getByTestId('canvas-stale')).toBeVisible();
  await page.getByTestId('collapse-code').click();
  await expect(page.getByTestId('rail-code')).toBeVisible();
  await expect(page.getByTestId('expand-code')).toBeFocused();
  await capture(page, 'code-default-single-pane-light');
  await page.getByTestId('expand-code').click();
  await expect(page.locator('.cm-content')).toBeVisible();
  expect(normalise(await documentText(page))).toBe(normalise(broken));

  await seedCode(page, DOC);
  await expect(page.getByTestId('diag-count')).toHaveText('0');
  await expect(page.getByTestId('canvas-stale')).toHaveCount(0);
  await expect(page.locator('.pc-obj[data-id="api"]')).not.toHaveClass(/pc-error/);
});

test('explicit collapsed and closed layouts survive reload and single-pane controls reopen Code', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('code-pane')).toBeVisible();
  await page.getByTestId('collapse-code').click();
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await expect(page.getByTestId('rail-code')).toBeVisible();
  await expect(page.locator('[data-panel="code"] .cm-content')).toHaveCount(0);

  await page.getByTestId('expand-code').click();
  await expect(page.getByTestId('code-pane')).toBeVisible();
  await choosePanelMenu(page, 'code', 'close-code');
  await expect(page.locator('[data-panel="code"]')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await expect(page.locator('[data-panel="code"]')).toHaveCount(0);
  await expect(page.getByTestId('rail-code')).toHaveCount(0);

  await chooseAppMenu(page, 'view-panel-code');
  await expect(page.getByTestId('code-pane')).toBeVisible();
  await expect(page.getByTestId('panel-title-code')).toBeFocused();
  await page.keyboard.press('Control+j');
  await expect(page.getByTestId('rail-code')).toBeVisible();
  await page.getByTestId('expand-code').click();
  await expect(page.getByTestId('code-pane')).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`responsive recovery keeps a usable canvas and an accessible Code drawer (${colorScheme})`, async ({ page }) => {
    await boot(page, colorScheme);
    await seedCode(page, DOC);
    await expectUsableSplit(page);
    await capture(page, `code-default-wide-${colorScheme}`);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId('code-pane')).toBeVisible();
    await expectUsableSplit(page);
    await capture(page, `code-default-medium-${colorScheme}`);

    await page.setViewportSize({ width: 520, height: 740 });
    await expect(page.getByTestId('rail-code')).toBeVisible();
    // The pane stays mounted but hidden, as every panel does when collapsed.
    await expect(page.getByTestId('code-pane')).toBeHidden();
    const canvas = await page.getByTestId('canvas').boundingBox();
    expect(canvas?.width ?? 0).toBeGreaterThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(520);
    await capture(page, `code-default-narrow-rail-${colorScheme}`);

    await page.getByTestId('expand-code').click();
    await expect(page.getByTestId('drawer-backdrop')).toBeVisible();
    await expect(page.getByTestId('code-pane')).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
    await capture(page, `code-default-narrow-drawer-${colorScheme}`);
    await scan(page);
    await page.getByTestId('collapse-code').click();
    await expect(page.getByTestId('expand-code')).toBeFocused();
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await expect(page.getByTestId('rail-code')).toBeVisible();
  });
}
