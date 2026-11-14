// SPDX-License-Identifier: GPL-3.0-only
// F-17 illustration registry: the flow header picks the style, the animator
// draws it (asserted through the DOM end-state) and the default stays per beat
// kind. Screenshots capture two styles for the visual record.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system web "Web"

ada -> web as aw

flow "Checkout" as main {
  intro "Kick off"
  ada -> web : "send"
  info "queued"
  conclusion "done"
}
`;

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await page.getByTestId('side-tab-flows').click();
  await page.getByTestId('flow-row-main').click();
}

test('F-17: choosing an illustration changes what the beat draws', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');

  // default (auto): the msg beat travels with a token
  await page.getByTestId('flow-play-main').click();
  await expect(page.getByTestId('playbar')).toBeVisible();
  await page.getByTestId('pb-present').click();
  await expect(page.getByTestId('present-dock')).toBeVisible();
  await page.getByTestId('present-dot-2').click(); // the msg beat
  await expect
    .poll(async () => canvas.locator('.pc-token').count(), { timeout: 5000 })
    .toBeGreaterThan(0);
  await capture(page, 'p2-illustration-token');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');

  // explicit choice: trail-fade draws the dash and no token
  await page.getByTestId('flow-illustration').selectOption('trail-fade');
  await page.getByTestId('flow-play-main').click();
  await page.getByTestId('pb-present').click();
  await page.getByTestId('present-dot-2').click();
  await expect.poll(async () => canvas.locator('.pc-trail').count(), { timeout: 5000 }).toBeGreaterThan(0);
  expect(await canvas.locator('.pc-token').count()).toBe(0);
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'p2-illustration-trail-dark');
  await page.keyboard.press('Escape');
});
