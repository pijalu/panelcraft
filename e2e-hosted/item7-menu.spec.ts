// SPDX-License-Identifier: GPL-3.0-only
// Hosted smoke, item 7: every menu surface is reachable on the deployed build —
// the reported symptom was a menu that ran off the viewport (and, on the live
// site, buttons that could not be found at all because they were off-screen).
import { expect, test, type Page } from '@playwright/test';
import { openApp, setDocument, shoot } from './lib/hosted';
import { openWorkspacePanels } from '../e2e/lib/panels';

const DOC = `pcd 1.0

system alpha "Alpha"
system beta "Beta"
system gamma "Gamma"

alpha -> beta : "one"
beta -> gamma : "two"
`;

/** Inside the window, allowing the shared 8 px edge margin. */
async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  expect(box.x, `${selector} left`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${selector} top`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${selector} right`).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height, `${selector} bottom`).toBeLessThanOrEqual(viewport.height + 0.5);
}

test.describe('item 7 — menus on the hosted build', () => {
  test('a long application menu and its submenu stay inside a short window', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await openApp(page);
    await page.getByTestId('app-menu').click();
    await expectInsideViewport(page, '#app-menu');
    // It scrolls instead of running past the edge, and End reaches the last row.
    const scrolls = await page.locator('#app-menu').evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
    await page.keyboard.press('End');
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-menu-index') ?? false)).toBe(true);

    const row = page.getByTestId('menu-export-current');
    await row.click();
    await expectInsideViewport(page, '#export-current-menu');
    await shoot(page, 'hosted-item7-submenu');
    await page.keyboard.press('Escape');
  });

  test('a canvas context menu opened in the corner stays keyboard-usable', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 560 });
    await openApp(page);
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, DOC);
    const canvas = page.getByTestId('canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6, { button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    await expectInsideViewport(page, '[data-testid="context-menu"]');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('data-testid')?.startsWith('ctx-') ?? false),
    ).toBe(true);
    await shoot(page, 'hosted-item7-context-menu');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
});
