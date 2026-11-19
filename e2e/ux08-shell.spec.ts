// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP03: the VS Code-inspired chrome must read as one editor shell in both
// themes — one 16 px icon grid, distinct focus/hover/selected/disabled states and
// 32 px targets. This spec captures the major surfaces for vision review and
// asserts the structural promises that a screenshot cannot prove (icon-only
// controls carry accessible names, chrome uses the semantic tokens).
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { chooseAppMenu, openAppGroup, openWorkspacePanels, setAppTheme } from './lib/panels';

const SCHEMES = ['light', 'dark'] as const;

async function ready(page: Page, scheme: (typeof SCHEMES)[number]): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await setAppTheme(page, scheme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
  await openWorkspacePanels(page, ['sidebar', 'palette', 'flows', 'code', 'props']);
}

test.describe('UX08-WP03 shell surfaces', () => {
  for (const scheme of SCHEMES) {
    test(`editor shell, menu, dialog and narrow layout (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await ready(page, scheme);
      await capture(page, `ux08-shell-${scheme}`);

      // Application menu: one elevation, 32 px rows, check marks and submenu carets.
      await page.getByTestId('app-menu').click();
      await openAppGroup(page, 'menu-group-application');
      await expect(page.getByTestId('app-theme-light')).toBeVisible();
      await capture(page, `ux08-menu-${scheme}`);
      await page.keyboard.press('Escape');

      // Keyboard focus ring must be visible on a chrome control.
      await page.getByTestId('app-menu').focus();
      await page.keyboard.press('Tab');
      await capture(page, `ux08-focus-${scheme}`);

      // Dialog surface (clear-data), then dismiss without acting.
      await chooseAppMenu(page, 'tb-clear-data');
      await expect(page.getByTestId('clear-dialog')).toBeVisible();
      await capture(page, `ux08-dialog-${scheme}`);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('clear-dialog')).toBeHidden();
    });
  }

  test('narrow viewport opens panels as overlay drawers, not a squeeze', async ({ page }) => {
    // At 520 px, one panel at a time opens in a modal drawer behind a backdrop.
    // Fresh panels stay collapsed; the user opens the drawer from its rail.
    await page.setViewportSize({ width: 520, height: 640 });
    await page.goto('/');
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await page.getByTestId('expand-palette').click();
    await expect(page.getByTestId('drawer-backdrop')).toBeVisible();
    for (const scheme of SCHEMES) {
      await setAppTheme(page, scheme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      await capture(page, `ux08-narrow-${scheme}`);
    }
    const backdrop = page.getByTestId('drawer-backdrop');
    await expect(backdrop).toBeVisible();
    // Targets stay usable: the drawer's own controls are still 32 px tall.
    const box = await page.getByTestId('app-menu').boundingBox();
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(32);
  });

  test('chrome controls expose accessible names and no Unicode glyph buttons', async ({ page }) => {
    await ready(page, 'light');
    // Every icon-only control in the shell resolves to a non-empty name.
    const unnamed = await page.evaluate(() => {
      const problems: string[] = [];
      for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('#app button'))) {
        const name = [button.getAttribute('aria-label'), button.title, button.textContent]
          .map((part) => (part ?? '').trim())
          .find((part) => part !== '');
        if (name === undefined) problems.push(button.outerHTML.slice(0, 120));
      }
      return problems;
    });
    expect(unnamed, unnamed.join('\n')).toEqual([]);

    // The owned icon set replaces the platform-font glyphs on chrome controls.
    const glyphs = await page.evaluate(() => {
      const marks = ['☰', '‹', '›', '✕', '⧉', '✎', '↑', '↓', '▶', '⏸', '⏮', '⏭', '↺'];
      const text = Array.from(document.querySelectorAll('#app button'))
        .map((button) => button.textContent ?? '')
        .join('');
      return marks.filter((mark) => text.includes(mark));
    });
    expect(glyphs).toEqual([]);
  });
});
