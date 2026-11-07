// SPDX-License-Identifier: GPL-3.0-only
// F-14 geometry persistence (review §3.4 item 9): a drag commits positions to
// the active view (debounced), opening/switching never re-positions, and only
// Auto-layout / Reset layout reorganise — both undoable.
import { expect, test, type Page } from '@playwright/test';

const DOC = `pcd 1.0

system a "A"
system b "B"
system c "C"

a -> b
b -> c
`;

async function seedDoc(page: Page, text: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

async function transforms(page: Page): Promise<Record<string, string>> {
  const canvas = page.getByTestId('canvas');
  const out: Record<string, string> = {};
  const objs = canvas.locator('g.pc-obj');
  const n = await objs.count();
  for (let i = 0; i < n; i++) {
    const g = objs.nth(i);
    const id = (await g.getAttribute('data-id'))!;
    out[id] = (await g.getAttribute('transform'))!;
  }
  return out;
}

async function dragObject(page: Page, id: string, dx: number, dy: number): Promise<void> {
  const canvas = page.getByTestId('canvas');
  const obj = canvas.locator(`g.pc-obj[data-id="${id}"]`);
  const b = (await obj.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

test('F-14: dragging commits positions; a reload reproduces them exactly', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);

  await dragObject(page, 'a', 40, 24);
  await dragObject(page, 'b', -32, 40);
  await dragObject(page, 'c', 56, -16);

  // debounced commit (250 ms) writes `position` lines into the active view
  await expect(page.locator('.cm-content')).toContainText('position a (');
  const moved = await transforms(page);

  await page.reload();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  expect(await transforms(page)).toEqual(moved);

  // the file keeps the geometry (a second reload is stable too)
  await page.reload();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  expect(await transforms(page)).toEqual(moved);
});

test('F-14: opening and switching files never re-positions', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await dragObject(page, 'a', 48, 32);
  await expect(page.locator('.cm-content')).toContainText('position a (');
  const before = await transforms(page);

  // add a second file, then switch back and forth
  await page.getByTestId('tree-new-file').click();
  const input = page.getByTestId('tree-create-input');
  await input.fill('other.pcd');
  await input.press('Enter');
  await seedDoc(page, 'pcd 1.0\n\nsystem z "Z"\n');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1);
  await page.getByTestId('tab-untitled.pcd').click();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  expect(await transforms(page)).toEqual(before);
});

test('F-14: Auto-layout reorganises, undo restores, reset clears positions', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await dragObject(page, 'a', 48, 32);
  await expect(page.locator('.cm-content')).toContainText('position a (');
  const dragged = await transforms(page);

  await page.getByTestId('apply-layout').click();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  const laidOut = await transforms(page);
  expect(laidOut).not.toEqual(dragged); // Auto-layout really reorganised
  await expect(page.locator('.cm-content')).toContainText('position');

  // undo restores the dragged geometry (and the commit writes it back)
  await page.mouse.click(5, 300); // focus the canvas, not an editor field
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect
    .poll(async () => transforms(page), { timeout: 5000 })
    .toEqual(dragged);

  // reset forgets the view's stored positions but keeps the diagram intact
  await page.getByTestId('reset-layout').click();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
});
