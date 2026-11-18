// SPDX-License-Identifier: GPL-3.0-only
// F-15 in-place rename (review §3.3 item 6): F2 / double-click opens an overlay
// input on the canvas; Enter commits through the normal undoable property path,
// Escape cancels, and the canvas label, the properties field and the code line
// all agree afterwards.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

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
  await seedCode(page, text);
}

test('F-15: double-click renames in place and every surface agrees', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  const obj = canvas.locator('g.pc-obj[data-id="api"]');
  await expect(obj).toHaveCount(1);

  await obj.dblclick();
  const input = page.getByTestId('inline-rename');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('aria-label', 'Rename system');
  await expect(input).toHaveValue('API');

  await input.fill('Payments API');
  await input.press('Enter');
  await expect(input).toHaveCount(0);

  // canvas label, properties field and code line all show the new name
  await expect(obj.locator('text.pc-label')).toContainText('Payments API');
  await expect(page.getByTestId('prop-name')).toHaveValue('Payments API');
  await expect(page.locator('.cm-content')).toContainText('system api "Payments API"');

  // one undo step reverts the whole rename
  await page.keyboard.press('Control+z');
  await expect(obj.locator('text.pc-label')).toContainText('API');

  // screenshots for the visual record (light + dark)
  await obj.dblclick();
  await expect(input).toBeVisible();
  await capture(page, 'p1-rename-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'p1-rename-dark');
  await page.keyboard.press('Escape');
});

test('F-15: F2 renames the selection, Escape leaves the label untouched', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  const obj = canvas.locator('g.pc-obj[data-id="api"]');
  await obj.click();
  await page.keyboard.press('F2');

  const input = page.getByTestId('inline-rename');
  await expect(input).toBeVisible();
  await input.fill('Discarded');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(obj.locator('text.pc-label')).toContainText('API');
  await expect(page.locator('.cm-content')).toContainText('system api "API"');
});
