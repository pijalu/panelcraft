// SPDX-License-Identifier: GPL-3.0-only
// CX-03: automatic vs explicit object stacking order — canvas paint order,
// z-aware hit-testing, undoable properties edits, reload/view persistence and
// the shared order reaching the SVG/PNG exports.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { chooseAppMenu, chooseExport, openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

// Five equal-size objects stacked on the same spot: one Auto, one explicit zero,
// one negative, one positive and one tie with the positive value. Document order
// is auto, back, zero, front, tie — Auto means "document order at z = 0".
const DOC = `pcd 1.0

system auto "Auto" {
  size 220 120
}
system back "Back" {
  size 220 120
  z -2
}
system zero "Zero" {
  size 220 120
  z 0
}
system front "Front" {
  size 220 120
  z 4
}
system tie "Tie" {
  size 220 120
  z 4
}

auto -> front as L1

layout saved
position auto (80, 100)
position back (50, 80)
position zero (110, 120)
position front (140, 140)
position tie (170, 160)
`;

/** Every object covers this world point, so a click proves the top-of-stack. */
const OVERLAP = { x: 200, y: 170 };

async function setDoc(page: Page, source: string): Promise<void> {
  await seedCode(page, source);
}

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page);
  await expect(page.locator('.cm-content')).toContainText('pcd 1.0');
  await setDoc(page, DOC);
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(5);
  // Views carry the overlapping positions; the stacking order itself is view-blind.
}

/** Object ids in DOM (= paint) order, bottom first. */
async function paintOrder(page: Page): Promise<string[]> {
  return page
    .getByTestId('canvas')
    .locator('g.pc-obj')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-id') ?? ''));
}

/** Assert paint order, tolerating the one pre-sync render after a reload. */
async function expectPaintOrder(page: Page, expected: string[]): Promise<void> {
  await expect.poll(() => paintOrder(page)).toEqual(expected);
}

async function canvasPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.getByTestId('canvas').evaluate((element, point) => {
    const svg = element as SVGSVGElement;
    const world = svg.querySelector('.pc-world') as SVGGElement;
    const matrix = world.getScreenCTM();
    if (!matrix) throw new Error('canvas is not on screen');
    const p = svg.createSVGPoint();
    p.x = point.x;
    p.y = point.y;
    const screen = p.matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, { x, y });
}

/** Click the shared overlap point and report which object the UI selected. */
async function clickOverlap(page: Page): Promise<void> {
  const point = await canvasPoint(page, OVERLAP.x, OVERLAP.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('prop-name')).toBeVisible();
}

/** The selected object's id, read from the identity field's name value. */
async function selectedId(page: Page): Promise<string> {
  const name = await page.getByTestId('prop-name').inputValue();
  return name.toLowerCase();
}

async function setStacking(page: Page, value: string): Promise<void> {
  const toggle = page.getByTestId('section-toggle-advanced');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const input = page.getByTestId('prop-z');
  await expect(input).toBeVisible();
  await input.fill(value);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`CX-03: stacking, hit order, undo, persistence and exports (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);

    // Auto/zero keep document order; negative sinks; equal z stays stable.
    await expectPaintOrder(page, ['back', 'auto', 'zero', 'front', 'tie']);
    const content = page.locator('.cm-content');
    await expect(content).toContainText('z -2');
    await expect(content).toContainText('z 0');
    await expect(content).toContainText('z 4');

    // The last-painted object owns the shared point.
    await clickOverlap(page);
    expect(await selectedId(page)).toBe('tie');
    await capture(page, `cx03-stacking-auto-negative-positive-tied-${theme}`);
    await test.info().attach(`cx03-stacking-${theme}-accessibility`, {
      body: await page.getByTestId('app-shell').ariaSnapshot(), contentType: 'text/plain',
    });
    await axe(page);

    // SVG and PNG exports carry the same order as the canvas.
    const svgDownload = page.waitForEvent('download');
    await chooseExport(page, 'svg');
    const svgPath = await (await svgDownload).path();
    if (!svgPath) throw new Error('SVG download has no path');
    const svg = await readFile(svgPath, 'utf8');
    // Only object groups count: the selection overlay repeats `data-id` on its
    // resize handles, so match the painted object elements themselves.
    const svgOrder = [...svg.matchAll(/<g class="pc-obj[^"]*"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
    expect(svgOrder).toEqual(['back', 'auto', 'zero', 'front', 'tie']);
    const pngDownload = page.waitForEvent('download');
    await chooseExport(page, 'png');
    const pngPath = await (await pngDownload).path();
    if (!pngPath) throw new Error('PNG download has no path');
    expect((await readFile(pngPath)).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    // An explicit value wins over document order — including for hit-testing.
    // (60, 90) is covered by "back" alone, so this selects it deliberately.
    const backPoint = await canvasPoint(page, 60, 90);
    await page.mouse.click(backPoint.x, backPoint.y);
    await expect(page.getByTestId('prop-name')).toHaveValue('Back');
    await setStacking(page, '9');
    await expect(content).toContainText('z 9');
    await expectPaintOrder(page, ['auto', 'zero', 'front', 'tie', 'back']);
    await clickOverlap(page);
    expect(await selectedId(page)).toBe('back');
    await capture(page, `cx03-stacking-explicit-edited-${theme}`);
    await axe(page);

    // Undo/redo of a z edit is a normal, reversible controller change.
    await chooseAppMenu(page, 'history-open');
    await page.getByTestId('history-undo').click();
    await expect(content).not.toContainText('z 9');
    await expectPaintOrder(page, ['back', 'auto', 'zero', 'front', 'tie']);
    await page.getByTestId('history-redo').click();
    await expect(content).toContainText('z 9');
    await page.getByTestId('history-close').click();
    const flash = page.getByTestId('banner-flash').getByRole('button', { name: 'dismiss' });
    if (await flash.isVisible()) await flash.click();

    // Stacking order is unchanged by the geometry edit.
    await expectPaintOrder(page, ['auto', 'zero', 'front', 'tie', 'back']);
    await expect(content).toContainText('z 9');

    // Reload: the explicit value survives and blanking it restores Auto.
    await page.waitForTimeout(400); // async store write
    await page.reload();
    await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(5);
    // View selection is not persisted, so re-apply the overlapping positions.
    await expect(page.locator('.cm-content')).toContainText('z 9');
    await expectPaintOrder(page, ['auto', 'zero', 'front', 'tie', 'back']);
    await clickOverlap(page);
    expect(await selectedId(page)).toBe('back');
    await setStacking(page, '');
    await expect(page.locator('.cm-content')).not.toContainText('z 9');
    // Cleared means Auto — document order at z 0 — not the original -2.
    await expectPaintOrder(page, ['auto', 'back', 'zero', 'front', 'tie']);
    await clickOverlap(page);
    expect(await selectedId(page)).toBe('tie');
    await capture(page, `cx03-stacking-restored-auto-${theme}`);
    await axe(page);
  });
}
