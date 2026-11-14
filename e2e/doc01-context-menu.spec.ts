// SPDX-License-Identifier: GPL-3.0-only
// DOC-01: the user guide's context-menu list must match the shipped menu, and the
// guide must not advertise stacking commands that do not exist (CX-03 put
// stacking order in Properties → Advanced instead).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

const DOC = `pcd 1.0

system a "A"
system b "B"
system c "C"

a -> b as L1

view "Base" {
  layout saved
  position a (60, 60)
  position b (280, 60)
  position c (500, 60)
}
`;

/** The exact labels the guide documents for a single-object selection. */
const DOCUMENTED_SINGLE = [
  'Duplicate', 'Copy', 'Paste', 'Delete',
  'Align left', 'Align centre (horizontal)', 'Align right',
  'Align top', 'Align middle (vertical)', 'Align bottom',
];

/** Multi-selection adds the commands that need two objects. */
const DOCUMENTED_MULTI = ['Distribute horizontally', 'Distribute vertically', 'Equal size'];

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(3);
  // Collapse the code panel so all three saved positions sit inside the canvas.
  await page.getByTestId('collapse-code').click();
  await page.getByTestId('view-select').selectOption('Base');
}

for (const theme of ['light', 'dark'] as const) {
  test(`DOC-01: guide matches the context menu (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await seed(page);
    const canvas = page.getByTestId('canvas');

    // Multi-selection enables the documented multi-object commands.
    // Distribute needs three objects; equal size needs two.
    await canvas.locator('g.pc-obj[data-id="a"]').click();
    await canvas.locator('g.pc-obj[data-id="b"]').click({ modifiers: ['Shift'] });
    await canvas.locator('g.pc-obj[data-id="c"]').click({ modifiers: ['Shift'] });
    await canvas.locator('g.pc-obj[data-id="c"]').click({ button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    for (const label of DOCUMENTED_MULTI) {
      await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
    }

    // Single selection: the exact documented list, with the multi-object
    // commands still listed but disabled.
    await canvas.locator('g.pc-obj[data-id="a"]').click();
    await canvas.locator('g.pc-obj[data-id="a"]').click({ button: 'right' });
    await expect(menu).toBeVisible();
    const labels = await menu.getByRole('menuitem').allInnerTexts();
    expect(labels.map((t) => t.trim())).toEqual([...DOCUMENTED_SINGLE, ...DOCUMENTED_MULTI]);
    await capture(page, `doc01-context-menu-${theme}`);
    await axe(page);
    for (const label of DOCUMENTED_SINGLE) {
      await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
    }
    // No stacking command is advertised: layering lives in Properties.
    for (const absent of ['Bring to front', 'Bring to back', 'Forward', 'Backward']) {
      await expect(menu.getByRole('menuitem', { name: absent, exact: true })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');

    // The guide itself: documented commands present, unsupported claim gone.
    const guide = readFileSync('docs/USER-GUIDE.md', 'utf8');
    for (const label of [...DOCUMENTED_SINGLE, ...DOCUMENTED_MULTI]) {
      expect(guide, `USER-GUIDE must document "${label}"`).toContain(label);
    }
    expect(guide).not.toMatch(/bring to front/i);
    expect(guide).toContain('Stacking order');
  });
}
