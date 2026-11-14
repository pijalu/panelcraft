// SPDX-License-Identifier: GPL-3.0-only
// F-11 properties panel: collapsible sections that persist, custom key-value
// properties and style overrides that reach the file and survive a reload.
import { expect, test, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system api "API"
system db "DB"

api -> db as L1
`;

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

test('F-11: sections collapse and their state survives a reload', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  await page.getByTestId('canvas').locator('g.pc-obj[data-id="api"]').click();

  // Advanced starts collapsed, Metadata open (defaults)
  await expect(page.getByTestId('section-toggle-advanced')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('section-toggle-metadata')).toHaveAttribute('aria-expanded', 'true');

  await page.getByTestId('section-toggle-metadata').click();
  await expect(page.getByTestId('section-toggle-metadata')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('section-toggle-advanced')).toHaveAttribute('aria-expanded', 'false');

  await page.waitForTimeout(400); // async store write
  await page.reload();
  await page.getByTestId('canvas').locator('g.pc-obj[data-id="api"]').click();
  await expect(page.getByTestId('section-toggle-metadata')).toHaveAttribute('aria-expanded', 'false');
});

test('F-11: custom properties and style overrides reach the file and reload', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await canvas.locator('g.pc-obj[data-id="api"]').click();

  await page.getByTestId('prop-prop-add').click();
  await page.getByTestId('prop-prop-key-0').fill('owner');
  await page.getByTestId('prop-prop-value-0').fill('core');
  await page.getByTestId('prop-style-fill').fill('#112233');

  const content = page.locator('.cm-content');
  await expect(content).toContainText('property owner "core"');
  await expect(content).toContainText('fill #112233');

  // the override is painted (custom property on the object group)
  const fill = await canvas
    .locator('g.pc-obj[data-id="api"]')
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--pc-shape-fill'));
  expect(fill).toBe('#112233');

  await page.waitForTimeout(400);
  await page.reload();
  await expect(canvas.locator('g.pc-obj[data-id="api"]')).toHaveCount(1);
  const after = await canvas
    .locator('g.pc-obj[data-id="api"]')
    .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--pc-shape-fill'));
  expect(after).toBe('#112233');
  await expect(content).toContainText('property owner "core"');
});
