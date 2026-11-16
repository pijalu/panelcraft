// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP05: the canvas grid has three visible states and snapping is a
// separate preference. Both are browser-local editor settings: they survive a
// reload, never touch the document, and never appear in an export.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { chooseAppMenu, chooseExport, openWorkspacePanels, setAppTheme } from './lib/panels';
import { capture } from './lib/screenshots';

const gridRect = (page: Page) => page.locator('svg[data-testid="canvas"] rect.pc-grid');

/** The grid's `fill` proves which pattern is painted (or that none is). */
async function gridFill(page: Page): Promise<string | null> {
  const rect = gridRect(page);
  if (!(await rect.isVisible())) return null;
  return rect.getAttribute('fill');
}

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await openWorkspacePanels(page, ['code']);
  const editor = page.locator('.cm-content');
  // Replace the contenteditable atomically so a re-render cannot clear the
  // select-all selection between the shortcut and text insertion.
  await editor.fill('pcd 1.0\n\nsystem api "API"\nsystem db "DB"\n\napi -> db as L1\n');
  await expect(page.locator('svg[data-testid="canvas"] g.pc-obj')).toHaveCount(2);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

async function chooseGrid(page: Page, type: 'off' | 'dots' | 'lines'): Promise<void> {
  await chooseAppMenu(page, `view-grid-${type}`);
}

/**
 * Ctrl+wheel zoom over the canvas. A downward wheel tick (`deltaY` 120) is
 * zoom out — one tick is a 2^-50/500 ≈ 0.933 factor, so 8 ticks land near 0.57:
 * zoomed out but still above the 0.5 threshold where the grid is dropped.
 */
async function zoomSteps(page: Page, direction: 'in' | 'out', ticks: number): Promise<void> {
  await page.locator('svg[data-testid="canvas"]').hover();
  await page.keyboard.down('Control');
  for (let i = 0; i < ticks; i++) await page.mouse.wheel(0, direction === 'out' ? 120 : -120);
  await page.keyboard.up('Control');
}

test.describe('canvas grid (UX08-WP05)', () => {
  test('three grid types and a separate snap toggle, both kept across a reload', async ({ page }) => {
    await ready(page);
    // Nothing is drawn before the user asks for a grid.
    await expect.poll(() => gridFill(page)).toBeNull();

    await chooseGrid(page, 'dots');
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-dots)');
    await chooseGrid(page, 'lines');
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-lines)');
    await chooseGrid(page, 'dots');

    // Vision review evidence: both types at 100 % and zoomed out, both themes.
    for (const scheme of ['light', 'dark'] as const) {
      await setAppTheme(page, scheme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await capture(page, `ux08-grid-dots-${scheme}`);
      await chooseGrid(page, 'lines');
      await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-lines)');
      await capture(page, `ux08-grid-lines-${scheme}`);
      await chooseGrid(page, 'dots');
    }
    await setAppTheme(page, 'system');

    // Low zoom: the grid must stay subtle until it is dropped, not turn into a tint.
    await zoomSteps(page, 'out', 8);
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-dots)');
    for (const scheme of ['light', 'dark'] as const) {
      await setAppTheme(page, scheme);
      await capture(page, `ux08-grid-dots-lowzoom-${scheme}`);
      await chooseGrid(page, 'lines');
      await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-lines)');
      await capture(page, `ux08-grid-lines-lowzoom-${scheme}`);
      await chooseGrid(page, 'dots');
    }
    await setAppTheme(page, 'system');

    // Far out the pattern would become an even tint: it is dropped, but the
    // preference is kept, so zooming back in paints it again.
    await zoomSteps(page, 'out', 8);
    await expect.poll(() => gridFill(page)).toBeNull();
    await zoomSteps(page, 'in', 16);
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-dots)');
    await page.locator('svg[data-testid="canvas"]').click({ position: { x: 40, y: 40 } });
    await page.keyboard.press('0');
    await chooseAppMenu(page, 'view-grid-snap');
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-dots)');
    // … and turning the grid off must not turn snapping back on.
    await chooseGrid(page, 'off');
    await expect.poll(() => gridFill(page)).toBeNull();

    // Both preferences survive a reload (browser-local, not diagram data).
    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await expect.poll(() => gridFill(page)).toBeNull();
    await page.getByTestId('app-menu').click();
    await expect(page.getByTestId('view-grid-snap')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('view-grid-off')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // The `g` shortcut restores the last visible type, not the default.
    await page.locator('svg[data-testid="canvas"]').click({ position: { x: 40, y: 40 } });
    await page.keyboard.press('g');
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-dots)');
  });

  test('the grid is editor-only: it never reaches the document or an export', async ({ page }) => {
    await ready(page);
    await chooseGrid(page, 'lines');
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-lines)');

    // Not written into the file: the code view stays the diagram only.
    const editor = page.locator('.cm-content');
    await expect(editor).not.toContainText('grid');
    await expect(editor).toContainText('system api');

    const download = page.waitForEvent('download');
    await chooseExport(page, 'svg');
    const svgPath = await (await download).path();
    if (!svgPath) throw new Error('SVG download has no path');
    const exported = await readFile(svgPath, 'utf8');
    expect(exported).toContain('pc-obj');
    expect(exported).not.toContain('pc-grid');
  });

  test('the grid does not intercept pointer input', async ({ page }) => {
    await ready(page);
    await chooseGrid(page, 'lines');
    await expect.poll(() => gridFill(page)).toBe('url(#pc-grid-pattern-lines)');

    // Clicking empty canvas selects nothing; clicking a shape still selects it,
    // which is only true while the grid rect is pointer-transparent.
    const canvas = page.locator('svg[data-testid="canvas"]');
    await canvas.click({ position: { x: 40, y: 300 } });
    await expect(page.getByTestId('properties')).toHaveCount(0);
    await canvas.locator('g.pc-obj[data-id="api"]').click();
    await expect(canvas.locator('g.pc-obj[data-id="api"].pc-selected')).toHaveCount(1);
  });
});
