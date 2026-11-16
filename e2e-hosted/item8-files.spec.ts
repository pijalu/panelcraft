// SPDX-License-Identifier: GPL-3.0-only
// Hosted smoke, item 8: a long file name must not push the file actions out of
// the Files panel on the deployed build, and the same actions stay reachable from
// the row context menu (pointer and keyboard).
import { expect, test } from '@playwright/test';
import { openApp, shoot } from './lib/hosted';
import { openWorkspacePanels } from '../e2e/lib/panels';

const LONG = 'extremely-long-unbroken-filename-that-would-overflow-any-panel.pcd';

test.describe('item 8 — long file names on the hosted build', () => {
  test('the name wraps and every file action stays reachable', async ({ page }) => {
    // A narrow window squeezes the panel: the reported case.
    await page.setViewportSize({ width: 760, height: 720 });
    await openApp(page);
    await openWorkspacePanels(page, ['sidebar']);
    await page.getByTestId('tree-new-file').click();
    await page.getByTestId('tree-create-input').fill(LONG);
    await page.getByTestId('tree-create-input').press('Enter');

    const row = page.getByTestId(`tree-row-${LONG}`);
    await expect(row).toBeVisible();
    await row.hover();
    const geometry = await row.evaluate((el) => {
      const name = el.querySelector('.tree-name') as HTMLElement;
      const tree = el.closest('.tree-rows') as HTMLElement;
      return {
        lines: Math.round(name.getBoundingClientRect().height / 18),
        title: name.getAttribute('title'),
        overflow: tree.scrollWidth - tree.clientWidth,
      };
    });
    // Two lines of name, the whole name in the tooltip, no horizontal overflow.
    expect(geometry.lines).toBeGreaterThan(1);
    expect(geometry.lines).toBeLessThanOrEqual(3);
    expect(geometry.title).toBe(LONG);
    expect(geometry.overflow).toBeLessThanOrEqual(1);

    for (const action of ['ren', 'dup', 'del']) {
      await expect(page.getByTestId(`tree-${action}-${LONG}`)).toBeVisible();
    }
    await shoot(page, 'hosted-item8-long-name');

    // Keyboard route: Shift+F10 opens the row menu with the same actions.
    await row.locator('.tree-name').focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByTestId('tree-context-menu')).toBeVisible();
    for (const id of ['open', 'duplicate', 'rename', 'delete']) {
      await expect(page.getByTestId(`tree-ctx-${id}`)).toBeVisible();
    }
    await shoot(page, 'hosted-item8-row-menu');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tree-context-menu')).toHaveCount(0);
  });
});
