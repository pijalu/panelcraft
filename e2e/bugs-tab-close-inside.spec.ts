// SPDX-License-Identifier: GPL-3.0-only
// Bug: the tab's close cross could render outside the tab's own outline, because
// the tab chrome belonged to the name button while the cross sat next to it.
// The regression measures real boxes: every close button must stay inside the
// tab that owns it, with a short and a long file name, in both themes.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

interface TabBox {
  /** Box of the element that paints the tab's outline (non-zero right border). */
  outline: { left: number; right: number; top: number; bottom: number } | null;
  close: { left: number; right: number; top: number; bottom: number } | null;
  name: string;
}

async function measure(page: Page): Promise<TabBox[]> {
  return page.evaluate(() => {
    const strip = document.querySelector('[data-testid="tab-strip"]');
    const tabs = [...(strip?.querySelectorAll('.tab') ?? [])];
    return tabs.map((tab) => {
      // The outline is whichever element actually paints a right border — that
      // is the box the user reads as "the tab".
      const painted = [tab, ...tab.querySelectorAll('*')]
        .find((el) => Number.parseFloat(getComputedStyle(el).borderRightWidth) > 0.5) ?? null;
      const o = painted?.getBoundingClientRect() ?? null;
      const close = tab.querySelector('.tab-close')?.getBoundingClientRect() ?? null;
      return {
        outline: o === null ? null : { left: o.left, right: o.right, top: o.top, bottom: o.bottom },
        close: close === null ? null : { left: close.left, right: close.right, top: close.top, bottom: close.bottom },
        name: tab.querySelector('.tab-name')?.textContent ?? '',
      };
    });
  });
}

/** Create a file with `name` in the workspace root, leaving other tabs open. */
async function openFile(page: Page, name: string): Promise<void> {
  await page.getByTestId('tree-new-file').click();
  await page.getByTestId('tree-create-input').fill(name);
  await page.getByTestId('tree-create-input').press('Enter');
  await expect(page.getByTestId(`tab-${name}`)).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`every tab keeps its close cross inside its own outline (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await openWorkspacePanels(page, ['sidebar', 'code']);
    await openFile(page, 'short.pcd');
    await openFile(page, 'a-rather-long-file-name-for-a-tab.pcd');

    const boxes = await measure(page);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const box of boxes) {
      expect(box.close, `close button exists for ${box.name}`).not.toBeNull();
      expect(box.outline, `${box.name} paints a tab outline`).not.toBeNull();
      const { close, outline } = box;
      expect(close!.right, `${box.name} cross right edge inside the tab outline`).toBeLessThanOrEqual(outline!.right + 0.5);
      expect(close!.left, `${box.name} cross left edge inside the tab outline`).toBeGreaterThanOrEqual(outline!.left - 0.5);
      expect(close!.top).toBeGreaterThanOrEqual(outline!.top - 0.5);
      expect(close!.bottom).toBeLessThanOrEqual(outline!.bottom + 0.5);
    }
    await capture(page, `tab-close-inside-${theme}`, { golden: false });
  });
}

test('a narrow viewport still keeps every close cross inside its tab', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 420, height: 720 });
  await page.goto('/');
  await openWorkspacePanels(page, ['sidebar']);
  await openFile(page, 'narrow.pcd');
  await openFile(page, 'second-narrow-file.pcd');
  const boxes = await measure(page);
  for (const box of boxes) {
    expect(box.close!.right, `${box.name} cross inside the tab outline`).toBeLessThanOrEqual(box.outline!.right + 0.5);
  }
});
