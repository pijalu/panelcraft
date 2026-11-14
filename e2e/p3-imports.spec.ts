// SPDX-License-Identifier: GPL-3.0-only
// F-20 imports as ghosts (FR-I1..I4): imported objects render read-only with a
// badge, links to them survive a canvas write, clicking a ghost opens its source
// file, and a missing import surfaces as a banner instead of silence.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const MAIN = `pcd 1.0

import shared as "../shared/actors.pcd"

system api "API"

api -> shared.psp as L1
`;

const SHARED = `pcd 1.0

person psp "PSP"
`;

async function seedFile(page: Page, path: string, text: string): Promise<void> {
  await openWorkspacePanels(page);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await page.getByTestId('tree-new-file').click();
  const input = page.getByTestId('tree-create-input');
  await input.fill(path);
  await input.press('Enter');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

test('F-20: imported objects render as ghosts and links to them survive', async ({ page }) => {
  await page.goto('/');
  await seedFile(page, 'shared/actors.pcd', SHARED);
  await seedFile(page, 'svc/main.pcd', MAIN);

  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj[data-id="api"]')).toHaveCount(1);
  const ghost = canvas.locator('g.pc-obj[data-id="shared.psp"]');
  await expect(ghost).toHaveCount(1);
  await expect(ghost).toHaveClass(/pc-ghost/);
  await expect(ghost).toContainText('imported');
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);

  // a canvas edit (drag the real object) must not delete the cross-file link
  const box = (await canvas.locator('g.pc-obj[data-id="api"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.cm-content')).toContainText('api -> shared.psp');

  await capture(page, 'p3-imports-light');

  // click-through: the ghost opens its source file
  await ghost.click();
  await expect(page.getByTestId('tab-shared/actors.pcd')).toHaveAttribute('data-active', 'true');
});

test('F-20: a missing import is surfaced in the banner', async ({ page }) => {
  await page.goto('/');
  await seedFile(page, 'svc/main.pcd', 'pcd 1.0\nimport gone as "./missing.pcd"\nsystem api "API"\n');
  const banner = page.getByTestId('import-errors');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('imported file not found');
});
