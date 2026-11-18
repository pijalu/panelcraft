// SPDX-License-Identifier: GPL-3.0-only
// F-19 command layer: context menu (duplicate/copy/paste/align/equal-size) and
// the keyboard clipboard shortcuts. Every command is undoable and lands in the
// file with remapped ids.
import { expect, test, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system a "A"
system b "B"

a -> b as L1
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

test('F-19: context menu duplicates without id collisions', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');
  await canvas.locator('g.pc-obj[data-id="a"]').click();
  await canvas.locator('g.pc-obj[data-id="a"]').click({ button: 'right' });

  const menu = page.getByTestId('context-menu');
  await expect(menu).toBeVisible();
  await page.getByTestId('ctx-duplicate').click();
  await expect(menu).toHaveCount(0);
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);

  const ids = await canvas.locator('g.pc-obj').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-id')),
  );
  expect(new Set(ids).size).toBe(3);
  await expect(page.locator('.cm-content')).toContainText('system o');
});

test('F-19: align left from the menu lines objects up (undoable)', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');
  await canvas.locator('g.pc-obj[data-id="a"]').click();
  await canvas.locator('g.pc-obj[data-id="b"]').click({ modifiers: ['Shift'] });
  await canvas.locator('g.pc-obj[data-id="b"]').click({ button: 'right' });
  await expect(page.getByTestId('context-menu')).toBeVisible();
  // Item 7: arrangement commands live in the Arrange group.
  await page.getByTestId('ctx-arrange').click();
  await page.getByTestId('ctx-align-left').click();

  const xs = await canvas.locator('g.pc-obj').evaluateAll((els) =>
    els.map((el) => (el.getAttribute('transform') ?? '').match(/translate\((-?\d+)/)?.[1]),
  );
  expect(new Set(xs).size).toBe(1);

  await page.mouse.click(10, 400); // focus the shell, not the code editor
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () =>
      canvas.locator('g.pc-obj').evaluateAll((els) =>
        new Set(els.map((el) => (el.getAttribute('transform') ?? '').match(/translate\((-?\d+)/)?.[1])).size,
      ),
    )
    .toBe(2);
});

test('F-19: Ctrl+C / Ctrl+V copies with fresh ids', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');
  await canvas.locator('g.pc-obj[data-id="a"]').click();
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  const ids = await canvas.locator('g.pc-obj').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-id')),
  );
  expect(new Set(ids).size).toBe(3);
});
