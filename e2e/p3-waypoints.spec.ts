// SPDX-License-Identifier: GPL-3.0-only
// F-19 waypoint dragging: a link's explicit `waypoint` renders a handle, the
// drag re-routes orthogonally, the new coordinates reach the file and survive a
// reload (they are document data, not session state).
import { expect, test, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system a "A"
system b "B"

a -> b as L1 {
  waypoint (300, 200)
}
`;

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
}

test('F-19: dragging a waypoint re-routes and persists', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');
  // select the link by clicking ON its stroke (the route zig-zags through the
  // waypoint, so the element's bbox centre is not on the path)
  const canvasBox = (await canvas.boundingBox())!;
  await page.mouse.click(canvasBox.x + 300, canvasBox.y + 200);

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
  const box2 = (await canvas.boundingBox())!;
  // the moved waypoint is on the route — click it to select the link again
  await page.mouse.click(box2.x + wx, box2.y + wy);
  const after = await canvas
    .locator('.pc-waypoint')
    .first()
    .evaluate((el) => [el.getAttribute('cx'), el.getAttribute('cy')]);
  expect([Number(after[0]), Number(after[1])]).toEqual([wx, wy]);
});
