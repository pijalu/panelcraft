// SPDX-License-Identifier: GPL-3.0-only
// Item 10: a document with connections but no authored flow is presentable
// straight away. The default C4 context template is the reported case: it ships
// Customer → Shop ("buys") and Shop → Payment provider ("charges"), and the
// launcher must offer that walkthrough without anything being written into the
// file, presented twice, or duplicated on reload.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const C4 = `pcd 1.0

person customer "Customer"
system shop "Shop"
system_ext pay "Payment provider"

customer -> shop : "buys"
shop -> pay : "charges"
`;

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page, ['code']);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.fill(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

/** The code view's text, i.e. exactly what a save would write. */
async function docText(page: Page): Promise<string> {
  const lines = await page.locator('.cm-content .cm-line').allInnerTexts();
  return lines.join('\n');
}

test.describe('virtual default flow (item 10)', () => {
  test('the launcher offers the derived flow and plays "buys" then "charges"', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, C4);

    await page.getByTestId('present-open').click();
    await expect(page.getByTestId('present-launcher')).toBeVisible();
    await expect(page.getByTestId('launcher-title-default')).toHaveText('Default flow');
    await expect(page.getByTestId('launcher-derived-default')).toBeVisible();
    await capture(page, 'item10-launcher-derived');

    await page.getByTestId('launcher-flow-default').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
    // First beat: Customer → Shop, labelled "buys".
    await expect(page.getByTestId('present-counter')).toContainText('1');
    await expect(page.getByTestId('present-notes')).toContainText('buys');
    await page.waitForTimeout(450);
    await capture(page, 'item10-present-buys');

    await page.getByTestId('present-next').click();
    await expect(page.getByTestId('present-notes')).toContainText('charges');
    await page.waitForTimeout(450);
    await capture(page, 'item10-present-charges');

    await page.keyboard.press('Escape');
    // Presenting is a read-only act: the file still has no flow.
    expect(await docText(page)).not.toContain('flow');
  });

  test('presenting twice and reloading never appends or duplicates a flow', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, C4);
    const before = await docText(page);

    for (const round of [1, 2]) {
      await page.getByTestId('present-open').click();
      await page.getByTestId('launcher-flow-default').click();
      await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'true');
      await page.getByTestId('present-exit').click();
      await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
      expect(await docText(page), `round ${round}`).toBe(before);
    }

    await page.reload();
    await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('pcd 1.0');
    expect(await docText(page)).toBe(before);
    await page.getByTestId('present-open').click();
    // Still exactly one entry after the reload.
    await expect(page.getByTestId('launcher-list').locator('li')).toHaveCount(1);
    await page.keyboard.press('Escape');
  });

  test('the first edit turns the derived flow into one real, saved flow', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, C4);
    await expect(page.locator('svg[data-testid="canvas"] g.pc-link')).toHaveCount(2);

    await openWorkspacePanels(page, ['flows']);
    await expect(page.getByTestId('flow-derived-hint')).toBeVisible();
    await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');

    // Editing Default creates one custom copy; Default remains live alongside it.
    await page.getByTestId('step-0').click();
    await page.getByTestId('step-remove').click();
    await expect(page.getByTestId('flow-derived-hint')).toHaveCount(0);
    await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
    await expect(page.getByTestId('flow-row-flow1')).toHaveText('Custom flow');

    const text = await docText(page);
    // Exactly one flow block, and the removed step is gone from it (the diagram
    // connection itself is untouched, which is the point of a flow being a view).
    const flowBody = text.slice(text.indexOf('flow '));
    expect(text.match(/^flow /gm) ?? []).toHaveLength(1);
    // Connector labels stay on the diagram and are inherited by the step.
    expect(flowBody).toContain('shop -> pay');
    expect(flowBody).not.toContain('buys');
    expect(text).toContain('customer -> shop : "buys"');

    // Undo restores the derived state; the file is authoritative afterwards.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
  });

  test('a document without connections still gets an element-backed default flow', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, 'pcd 1.0\n\nsystem lonely "Lonely"\n');
    await openWorkspacePanels(page, ['flows']);
    await expect(page.getByTestId('flow-empty')).toHaveCount(0);
    await expect(page.getByTestId('flow-derived-hint')).toBeVisible();
    await expect(page.getByTestId('flow-row-default')).toHaveText('Default flow');
    await expect(page.getByTestId('step-title-0')).toHaveText('Lonely');
  });
});
