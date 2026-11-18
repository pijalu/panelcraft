// SPDX-License-Identifier: GPL-3.0-only
// F-22 canvas accessibility + canvas↔code map: roving keyboard navigation with
// ARIA roles/labels on scene nodes, and selecting an object highlights its
// statement in the code view (and vice versa).
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system a "Alpha" {
  description "first"
}
system b "Beta"
system c "Gamma"

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
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(3);
}

test('F-22: Tab/arrows walk the objects and announce them', async ({ page }) => {
  await seed(page);
  // leave the code editor so Tab belongs to the canvas (text fields keep their keys)
  await page.getByTestId('canvas').click({ position: { x: 5, y: 5 } });
  const canvas = page.getByTestId('canvas');
  const first = canvas.locator('g.pc-obj[data-id="a"]');
  await expect(first).toHaveAttribute('role', 'button');
  await expect(first).toHaveAttribute('aria-label', 'system Alpha');

  await page.keyboard.press('Tab');
  await expect(first).toHaveClass(/pc-selected/);
  await page.keyboard.press('Tab');
  await expect(canvas.locator('g.pc-obj[data-id="b"]')).toHaveClass(/pc-selected/);
  await page.keyboard.press('Shift+Tab');
  await expect(first).toHaveClass(/pc-selected/);
  await page.keyboard.press('ArrowRight');
  await expect(canvas.locator('g.pc-obj[data-id="b"]')).toHaveClass(/pc-selected/);
});

test('F-22: selecting on the canvas highlights the code statement', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');
  await canvas.locator('g.pc-obj[data-id="a"]').click();

  // the object's statement lines are highlighted (decoration, not caret)
  const highlighted = page.locator('.pc-code-highlight');
  await expect(highlighted.first()).toBeVisible();
  const text = await page.locator('.cm-content').innerText();
  const lines = text.split('\n');
  const firstIdx = lines.findIndex((l) => l.includes('system a "Alpha"'));
  expect(lines[firstIdx]).toContain('system a "Alpha"');
  await expect(highlighted).toHaveCount(3); // statement + block lines
  await capture(page, 'p3-canvas-code-map');
});

test('F-22: placing the caret in a statement selects that object', async ({ page }) => {
  await seed(page);
  const canvas = page.getByTestId('canvas');
  await page.locator('.cm-line').filter({ hasText: 'system c "Gamma"' }).click();
  await page.keyboard.press('End');
  await expect(canvas.locator('g.pc-obj[data-id="c"]')).toHaveClass(/pc-selected/);
});
