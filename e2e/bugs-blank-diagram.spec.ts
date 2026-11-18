// SPDX-License-Identifier: GPL-3.0-only
// Blank diagram creation: a new file must be startable from nothing. The gallery
// offers a blank card beside the templates, choosing it seeds a valid empty
// document (header only), keeps the file active, closes the gallery, and leaves
// the canvas ready for keyboard placement and code editing.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels, setAppTheme } from './lib/panels';

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  expect(violations, violations.join('\n')).toEqual([]);
}

test.describe('blank diagram creation', () => {
  test('a blank choice creates a valid empty document and the canvas stays usable', async ({ page }) => {
    await page.goto('/');
    await openWorkspacePanels(page);
    const gallery = page.getByTestId('empty-state');
    await expect(gallery).toBeVisible();

    // The blank card is offered beside the templates, and comes first in
    // keyboard order because it is the shortest path to drawing.
    await expect(page.getByTestId('template-blank')).toBeVisible();
    const cards = page.locator('.empty-card');
    await expect(cards.first()).toHaveAttribute('data-testid', 'template-blank');
    await axe(page);
    await capture(page, 'bugs-blank-gallery');

    await page.getByTestId('template-blank').click();

    // The gallery closes and does not reopen over the empty canvas.
    await expect(gallery).toHaveCount(0);
    // Still the same active file: blank means "insert nothing", not "new tab".
    await expect(page.getByTestId('tab-untitled.pcd')).toHaveAttribute('data-active', 'true');
    // No shapes, no connections, no template prose.
    await expect(page.locator('.pc-obj')).toHaveCount(0);
    await expect(page.locator('.pc-link')).toHaveCount(0);
    // The code view holds a valid empty document, not sample content.
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('pcd 1.0');
    await expect(editor).not.toContainText('Flow');
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 15_000 });

    // Keyboard placement works on the blank canvas.
    await page.locator('svg[data-testid="canvas"]').click({ position: { x: 200, y: 200 } });
    await page.keyboard.press('2');
    await expect(page.locator('.pc-obj')).toHaveCount(1);
    await capture(page, 'bugs-blank-placed');

    await setAppTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await capture(page, 'bugs-blank-placed-dark');
    await setAppTheme(page, 'system');
  });

  test('the gallery is asked once per file, not on every empty canvas', async ({ page }) => {
    await page.goto('/');
    await openWorkspacePanels(page);
    await page.getByTestId('template-blank').click();
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    // Editing the code and clearing it again must not re-open the question.
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.insertText('# notes\n');
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 15_000 });
    await editor.click();
    await editor.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
  });
});
