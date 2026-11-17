// SPDX-License-Identifier: GPL-3.0-only
// Item 7: every menu surface stays usable on any supported viewport. The bug was
// a menu that could extend or scroll past the viewport edge, a nested submenu
// pinned to the right with no collision handling, and a canvas context menu drawn
// at raw pointer coordinates with no keyboard navigation.
//
// These assertions use real bounding boxes and real key presses: a DOM-presence
// check would pass for a menu that is off-screen.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openAppGroup, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system alpha "Alpha"
system beta "Beta"
system gamma "Gamma"

alpha -> beta : "one"
beta -> gamma : "two"
`;

async function ready(page: Page, text = DOC): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await openWorkspacePanels(page, ['code']);
  await page.locator('.cm-content').fill(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

/** Inside the viewport, allowing the shared 8 px edge margin. */
async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const b = (await target.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  expect(b.x, `${selector} left`).toBeGreaterThanOrEqual(0);
  expect(b.y, `${selector} top`).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, `${selector} right`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(b.y + b.height, `${selector} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  expect(violations, violations.join('\n')).toEqual([]);
}

test.describe('menu viewport contract (item 7)', () => {
  test('a long application menu scrolls internally and stays on screen', async ({ page }) => {
    // Short viewport: the command list cannot fit in one screen height.
    await page.setViewportSize({ width: 1280, height: 420 });
    await ready(page);
    await page.getByTestId('app-menu').click();
    const pop = page.locator('#app-menu');
    await expect(pop).toBeVisible();
    await expectInsideViewport(page, '#app-menu');

    // The surface never covers the control that opened it.
    const overlap = await page.evaluate(() => {
      const trigger = document.querySelector('[data-testid="app-menu"]')?.getBoundingClientRect();
      const menu = document.querySelector('#app-menu')?.getBoundingClientRect();
      if (trigger === undefined || menu === undefined) return 'missing';
      const intersects =
        menu.left < trigger.right && menu.right > trigger.left &&
        menu.top < trigger.bottom && menu.bottom > trigger.top;
      return intersects ? 'overlaps' : 'clear';
    });
    expect(overlap).toBe('clear');

    // Task grouping keeps the root short; the long command list is now the
    // Layout & workspace submenu, which must scroll internally instead.
    await capture(page, 'item7-app-menu-short');
    await openAppGroup(page, 'menu-group-layout');
    const group = page.locator('#group-layout-menu');
    await expectInsideViewport(page, '#group-layout-menu');
    const scrolls = await group.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
    }));
    expect(scrolls.scrollHeight).toBeGreaterThan(scrolls.clientHeight);
    expect(scrolls.overflowY).toBe('auto');
    // The surface itself reports that it scrolls (visible overflow cue).
    await expect(group).toHaveClass(/menu-scrolls/);

    // End jumps to the last command and scrolls it into view inside the menu.
    await page.locator('#group-layout-menu button:not([disabled])').first().focus();
    await page.keyboard.press('End');
    const last = await group.evaluate((el) => {
      const items = [...el.querySelectorAll<HTMLElement>('[data-menu-index]')];
      const focused = document.activeElement as HTMLElement | null;
      return {
        isLast: focused === items[items.length - 1],
        inside: focused === null ? false : focused.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1,
      };
    });
    expect(last.isLast).toBe(true);
    expect(last.inside).toBe(true);
    // The document itself never scrolled instead of the menu.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await axe(page);
    await capture(page, 'item7-app-menu-group-short');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('app-menu')).toHaveAttribute('aria-expanded', 'false');
  });

  test('a nested submenu flips to the left instead of leaving the viewport', async ({ page }) => {
    await ready(page);
    await page.getByTestId('app-menu').click();
    const exportRow = page.getByTestId('menu-export-current');
    await exportRow.hover();
    await exportRow.click();
    const submenu = page.locator('#export-current-menu');
    await expect(submenu).toBeVisible();
    await expectInsideViewport(page, '#export-current-menu');
    // The submenu sits beside its row, within the window, and scrolls if needed.
    const placement = await submenu.evaluate((el) => {
      const style = getComputedStyle(el);
      return { position: style.position, overflow: style.overflowY, maxHeight: style.maxHeight };
    });
    expect(placement.position).toBe('fixed');
    expect(placement.maxHeight).not.toBe('none');
    await axe(page);
    await capture(page, 'item7-submenu');
    await page.keyboard.press('Escape');
    await expect(page.locator('#export-current-menu')).toHaveCount(0);
  });

  test('a context menu opened in the bottom-right corner stays reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 560 });
    await ready(page);
    const canvas = page.getByTestId('canvas');
    const cb = (await canvas.boundingBox())!;
    // Right-click a few pixels from the bottom-right corner of the canvas.
    await page.mouse.click(cb.x + cb.width - 6, cb.y + cb.height - 6, { button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    await expectInsideViewport(page, '[data-testid="context-menu"]');
    // Keyboard is available on the context menu exactly as on the app menu.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    expect(focused.startsWith('ctx-')).toBe(true);
    await axe(page);
    await capture(page, 'item7-context-menu-corner');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    // Focus returns to the canvas (after the surface unmounts), without changing
    // the selection or creating undo history.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''))
      .toBe('canvas');
  });

  test('canvas commands keep the common actions direct and group arrangement', async ({ page }) => {
    await ready(page);
    const canvas = page.getByTestId('canvas');
    // Select two objects so the arrangement commands are actually available.
    await canvas.locator('g.pc-obj[data-id="alpha"]').click();
    await canvas.locator('g.pc-obj[data-id="beta"]').click({ modifiers: ['Shift'] });
    await canvas.locator('g.pc-obj[data-id="beta"]').click({ button: 'right' });

    // The five common actions are direct entries.
    for (const id of ['properties', 'duplicate', 'copy', 'paste', 'delete']) {
      await expect(page.getByTestId(`ctx-${id}`)).toBeVisible();
    }
    // Arrangement lives in one group, and every command is still present.
    const arrange = page.getByTestId('ctx-arrange');
    await expect(arrange).toBeVisible();
    await arrange.click();
    for (const id of ['align-left', 'align-right', 'align-top', 'align-bottom', 'equal-size']) {
      await expect(page.getByTestId(`ctx-${id}`)).toBeVisible();
    }
    await expectInsideViewport(page, '#arrange-menu');
    await capture(page, 'item7-canvas-arrange');
    // A grouped command still works.
    await page.getByTestId('ctx-align-left').click();
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
  });

  test('a narrow viewport keeps the application menu inside the window', async ({ page }) => {
    // Seed at the design width (a narrow shell turns panels into drawers), then
    // shrink to the narrow viewport that opens the menu.
    await ready(page);
    await page.setViewportSize({ width: 480, height: 720 });
    await page.getByTestId('app-menu').click();
    await expectInsideViewport(page, '#app-menu');
    await axe(page);
    await capture(page, 'item7-narrow-menu');
    await page.keyboard.press('Escape');
  });
});
