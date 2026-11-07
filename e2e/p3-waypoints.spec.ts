// SPDX-License-Identifier: GPL-3.0-only
// F-19 waypoint dragging: a link's explicit `waypoint` renders a handle, the
// drag re-routes orthogonally, the new coordinates reach the file and survive a
// reload (they are document data, not session state).
import { expect, test, type Page } from '@playwright/test';

const DOC = `pcd 1.0

system a "A"
system b "B"

a -> b as L1 {
  waypoint (300, 200)
}
`;

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
}

test('F-19: dragging a waypoint re-routes and persists', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');
  await canvas.locator('g.pc-link[data-id="L1"] path.pc-route').click({ force: true });

  const handle = canvas.locator('.pc-waypoint').first();
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 48, box.y + box.height / 2 + 32, { steps: 8 });
  await page.mouse.up();

  // the file carries the new waypoint (snapped to the 8 px grid)
  const content = page.locator('.cm-content');
  await expect(content).not.toContainText('waypoint (300, 200)');
  const m = /waypoint \((\d+), (\d+)\)/.exec(await content.innerText());
  expect(m).not.toBeNull();
  const [wx, wy] = [Number(m![1]), Number(m![2])];
  expect(wx % 8).toBe(0);
  expect(wy % 8).toBe(0);

  // …and the reloaded canvas puts the handle back at the same place
  await page.reload();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  await canvas.locator('g.pc-link[data-id="L1"] path.pc-route').click({ force: true });
  const after = await canvas
    .locator('.pc-waypoint')
    .first()
    .evaluate((el) => [el.getAttribute('cx'), el.getAttribute('cy')]);
  expect([Number(after[0]), Number(after[1])]).toEqual([wx, wy]);
});
