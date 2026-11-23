// SPDX-License-Identifier: GPL-3.0-only
// UX-08 WP02: hosted panels own exactly one scroller, never overflow horizontally at
// narrow dock widths, and degrade to a dismissible drawer on narrow viewports.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { chooseAppMenu, choosePanelMenu, openWorkspacePanels } from './lib/panels';

const WIDTHS = [200, 232, 280, 420] as const;

test.setTimeout(120_000);

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await openWorkspacePanels(page, ['palette']);
}

async function setPanelWidth(page: Page, panel: 'props' | 'flows', px: number): Promise<void> {
  await page.locator('.app-body').evaluate((el, arg) => {
    (el as HTMLElement).style.setProperty(arg.name, `${arg.px}px`);
  }, { name: `--pc-${panel}-w`, px });
}

/**
 * Chromium here only paints overlay scrollbars (a launch flag cannot switch that off in
 * headless macOS), so a classic bar cannot be rendered literally. A classic bar removes
 * 16px of content width, which is strictly narrower than an overlay bar: asserting the
 * panel at `width - 16` therefore covers the classic-scrollbar case exactly.
 */
const CLASSIC_WIDTHS = WIDTHS.map((width) => width - 16);

async function nameObject(page: Page, value: string): Promise<void> {
  const field = page.locator('[data-panel="props"] input').first();
  await field.fill(value);
  await field.blur();
}

async function hostMetrics(page: Page, panel: 'props' | 'flows'): Promise<{
  clientWidth: number;
  scrollWidth: number;
  scrollableChildren: number;
}> {
  return page.evaluate((id) => {
    const host = document.querySelector(`[data-panel="${id}"] .panel-host-content`);
    if (!(host instanceof HTMLElement)) throw new Error(`no host content for ${id}`);
    const scrollable = Array.from(host.querySelectorAll<HTMLElement>('*')).filter((el) => {
      const style = getComputedStyle(el);
      const scrolls = style.overflowY === 'auto' || style.overflowY === 'scroll';
      return scrolls && el.scrollHeight > el.clientHeight + 1;
    });
    return {
      clientWidth: host.clientWidth,
      scrollWidth: host.scrollWidth,
      scrollableChildren: scrollable.length,
    };
  }, panel);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`collapsed panels share one tab column per dock (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);
    await expect(page.getByTestId('code-pane')).toBeVisible();
    // The tab column is the collapsed state: start from Code shown, then fold
    // it back into the right column like any other panel.
    await page.getByTestId('collapse-code').click();
    await expect(page.getByTestId('rail-code')).toBeVisible();

    const left = page.getByTestId('collapsed-rail-left');
    const right = page.getByTestId('collapsed-rail-right');
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    await expect(page.getByTestId('dock-left').locator('.panel-rail-group')).toHaveCount(1);
    await expect(page.getByTestId('dock-right').locator('.panel-rail-group')).toHaveCount(1);
    await expect(left.getByTestId('rail-sidebar')).toBeVisible();
    await expect(left.getByTestId('rail-flows')).toBeVisible();
    await expect(right.getByTestId('rail-code')).toBeVisible();
    await expect(right.getByTestId('rail-props')).toBeVisible();

    for (const rail of [left, right]) {
      const box = await rail.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box!.width)).toBe(36);
    }

    await capture(page, `collapsed-panel-tabs-${colorScheme}`);

    await left.getByTestId('expand-flows').click();
    await expect(page.getByTestId('panel-title-flows')).toBeVisible();
    await expect(page.getByTestId('rail-sidebar')).toBeVisible();
    await expect(page.getByTestId('rail-flows')).toHaveCount(0);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`UX-08 WP02: Properties stays readable at narrow dock widths (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);
    await page.getByTestId('palette-system').click();
    await chooseAppMenu(page, 'view-panel-props');
    await expect(page.getByTestId('properties')).toBeVisible();

    for (const width of WIDTHS) {
      await setPanelWidth(page, 'props', width);
      const metrics = await hostMetrics(page, 'props');
      expect(metrics.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect(metrics.scrollableChildren, `nested scrollers at ${width}px`).toBe(0);

      const content = page.locator('[data-panel="props"] .panel-host-content');
      const last = page.getByTestId('section-advanced');
      await content.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const hostBox = await content.boundingBox();
      const lastBox = await last.boundingBox();
      expect(hostBox, 'host content box').not.toBeNull();
      expect(lastBox, 'last section box').not.toBeNull();
      if (hostBox && lastBox) {
        expect(lastBox.y + lastBox.height, `last section clipped at ${width}px`)
          .toBeLessThanOrEqual(hostBox.y + hostBox.height + 1);
      }
      await capture(page, `ux08-panels-props-${width}-${colorScheme}`);
    }
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`UX-08 WP02: classic-scrollbar widths and long values stay inside the panel (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);
    await page.getByTestId('palette-system').click();
    await chooseAppMenu(page, 'view-panel-props');
    await expect(page.getByTestId('properties')).toBeVisible();

    for (const width of CLASSIC_WIDTHS) {
      await setPanelWidth(page, 'props', width);
      await nameObject(page, 'System 2 with a deliberately long descriptive name that must wrap');
      const metrics = await hostMetrics(page, 'props');
      expect(metrics.scrollWidth, `classic-scrollbar overflow at ${width}px`)
        .toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect(metrics.scrollableChildren, `nested scrollers at ${width}px`).toBe(0);

      const escaping = await page.evaluate(() => {
        const host = document.querySelector('[data-panel="props"] .panel-host-content');
        if (!(host instanceof HTMLElement)) return 0;
        const right = host.getBoundingClientRect().right;
        return Array.from(host.querySelectorAll<HTMLElement>('input, textarea, button, select'))
          .filter((el) => el.getBoundingClientRect().right > right + 1).length;
      });
      expect(escaping, `controls pushed under the scrollbar at ${width}px`).toBe(0);
      await capture(page, `ux08-panels-classic-${width}-${colorScheme}`);
    }
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`UX-08 WP02: Flow Steps and floated panels keep one scroller (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await ready(page);
    await chooseAppMenu(page, 'view-panel-flows');
    await expect(page.getByTestId('panel-title-flows')).toBeFocused();

    for (const width of WIDTHS) {
      await setPanelWidth(page, 'flows', width);
      const metrics = await hostMetrics(page, 'flows');
      expect(metrics.scrollWidth, `flows horizontal overflow at ${width}px`)
        .toBeLessThanOrEqual(metrics.clientWidth + 1);
    }
    await capture(page, `ux08-panels-flows-${colorScheme}`);

    await chooseAppMenu(page, 'view-panel-props');
    await choosePanelMenu(page, 'props', 'dock-props-float');
    await expect(page.locator('[data-panel="props"]')).toHaveAttribute('data-dock', 'float');
    const metrics = await hostMetrics(page, 'props');
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.scrollableChildren).toBe(0);
    await capture(page, `ux08-panels-float-${colorScheme}`);
  });
}

test('UX-08 WP02: narrow viewport turns side panels into a dismissible drawer', async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 820 });
  await ready(page);
  await choosePanelMenu(page, 'palette', 'close-palette');
  await chooseAppMenu(page, 'view-panel-props');
  await expect(page.getByTestId('properties')).toBeVisible();

  const backdrop = page.getByTestId('drawer-backdrop');
  await expect(backdrop).toBeVisible();
  const hostBox = await page.locator('.panel-host[data-panel="props"]').boundingBox();
  expect(hostBox).not.toBeNull();
  if (hostBox) expect(hostBox.x + hostBox.width).toBeGreaterThan(560);

  // The drawer must not create horizontal page scroll, which would clip its actions.
  const pageOverflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(pageOverflow.clientWidth + 1);
  const actionsBox = await page.getByTestId('panel-menu-props').boundingBox();
  expect(actionsBox).not.toBeNull();
  if (actionsBox) expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(pageOverflow.clientWidth + 1);

  await capture(page, 'ux08-panels-drawer-light');

  const backdropBox = await backdrop.boundingBox();
  expect(backdropBox).not.toBeNull();
  if (backdropBox) await page.mouse.click(backdropBox.x + 60, backdropBox.y + 400);
  await expect(page.getByTestId('properties')).toBeHidden();
  await expect(page.getByTestId('app-menu')).toBeFocused();

  await chooseAppMenu(page, 'view-panel-props');
  await expect(page.getByTestId('drawer-backdrop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('properties')).toBeHidden();
  await expect(page.getByTestId('app-menu')).toBeFocused();
});
