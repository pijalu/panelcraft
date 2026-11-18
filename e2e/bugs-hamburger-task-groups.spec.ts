// SPDX-License-Identifier: GPL-3.0-only
// Task-grouped application menu: browser proof of the hierarchy, keyboard
// contract, measured placement and accessible/light/dark/narrow presentation.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openAppGroup } from './lib/panels';

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  expect(violations, violations.join('\n')).toEqual([]);
}

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  const vp = page.viewportSize();
  expect(box, `${selector} has a box`).not.toBeNull();
  if (box === null || vp === null) return;
  expect(box.x, `${selector} left`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${selector} top`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${selector} right`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y + box.height, `${selector} bottom`).toBeLessThanOrEqual(vp.height + 0.5);
}

test('frequent commands stay direct; advanced commands sit in named task groups', async ({ page }) => {
  await ready(page);
  await page.getByTestId('app-menu').click();
  for (const id of [
    'tb-import-files', 'menu-export-current', 'app-menu-flows', 'app-menu-present',
    'history-open', 'menu-group-file', 'menu-group-layout', 'menu-group-application',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  for (const group of ['menu-group-file', 'menu-group-layout', 'menu-group-application']) {
    await expect(page.getByTestId(group)).toHaveAttribute('aria-haspopup', 'menu');
  }
  await axe(page);
  await capture(page, 'bugs-hamburger-root');

  await openAppGroup(page, 'menu-group-layout');
  for (const id of [
    'view-panel-code', 'view-grid-dots', 'reset-workspace-layout',
    'menu-reset-diagram-layout', 'menu-reset-all-routes',
  ]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('tb-import-files')).toBeVisible();
  await axe(page);
  await capture(page, 'bugs-hamburger-group-layout');
});

test('ArrowRight opens a group and ArrowLeft returns focus to its row', async ({ page }) => {
  await ready(page);
  await page.getByTestId('app-menu').click();
  const row = page.getByTestId('menu-group-layout');
  await row.focus();
  await page.keyboard.press('ArrowRight');
  const submenu = page.locator('#group-layout-menu');
  await expect(submenu).toBeVisible();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#group-layout-menu [role="menuitem"]:focus')).toHaveCount(1);

  await page.keyboard.press('ArrowLeft');
  await expect(submenu).toHaveCount(0);
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await expect(row).toBeFocused();
});

test('Escape closes the whole menu from inside a group and focus returns to the trigger', async ({ page }) => {
  await ready(page);
  const trigger = page.getByTestId('app-menu');
  await trigger.click();
  await openAppGroup(page, 'menu-group-file');
  await expect(page.locator('#group-file-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-menu')).toHaveCount(0);
  await expect(page.locator('#group-file-menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a grouped command runs, closes the menu and returns focus to the trigger', async ({ page }) => {
  await ready(page);
  const trigger = page.getByTestId('app-menu');
  await trigger.click();
  await openAppGroup(page, 'menu-group-application');
  await page.getByTestId('app-theme-light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#app-menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const viewport of [{ width: 1280, height: 420 }, { width: 480, height: 720 }]) {
  test(`a group submenu stays inside the ${viewport.width}x${viewport.height} viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.getByTestId('app-menu').click();
    await openAppGroup(page, 'menu-group-file');
    await expectInsideViewport(page, '#app-menu');
    await expectInsideViewport(page, '#group-file-menu');
    const overlap = await page.evaluate(() => {
      const trigger = document.querySelector('[data-testid="app-menu"]')?.getBoundingClientRect();
      const submenu = document.querySelector('#group-file-menu')?.getBoundingClientRect();
      if (trigger === undefined || submenu === undefined) return true;
      return submenu.left < trigger.right && submenu.right > trigger.left
        && submenu.top < trigger.bottom && submenu.bottom > trigger.top;
    });
    expect(overlap, 'submenu must not cover its trigger').toBe(false);
    await axe(page);
    await capture(page, `bugs-hamburger-group-${viewport.width}`);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`the grouped menu is accessible and readable in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((preference) => {
      localStorage.setItem('panelcraft.app-theme', JSON.stringify({ version: 1, preference }));
    }, theme);
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByTestId('app-menu').click();
    await capture(page, `bugs-hamburger-root-${theme}`);
    await openAppGroup(page, 'menu-group-application');
    await expect(page.getByTestId(`app-theme-${theme}`)).toHaveAttribute('aria-checked', 'true');
    await axe(page);
    await capture(page, `bugs-hamburger-application-${theme}`);
  });
}
