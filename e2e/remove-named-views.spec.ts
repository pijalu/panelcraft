// SPDX-License-Identifier: GPL-3.0-only
// Named views removed without losing layout persistence (bugs.md, ADR 0007).
// The application and canvas menus share one selection policy, route reset never
// moves objects, and legacy view syntax is rejected with a clear diagnostic.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openAppGroup, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0
title "Layout contract"
system a "A"
system b "B"
a -> b as L1 {
  waypoint (140, 30)
}
layout saved
position a (40, 40)
position b (260, 40)
`;

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

async function transforms(page: Page): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const objs = page.getByTestId('canvas').locator('g.pc-obj');
  const n = await objs.count();
  for (let i = 0; i < n; i++) {
    const g = objs.nth(i);
    out[(await g.getAttribute('data-id'))!] = await g.getAttribute('transform');
  }
  return out;
}

test('route reset keeps saved positions; layout reset persists one deterministic layout', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const editor = page.locator('.cm-content');
  const before = await transforms(page);

  // No selection: application menu offers "Reset all routes".
  await page.getByTestId('app-menu').click();
  await openAppGroup(page, 'menu-group-layout');
  await expect(page.getByTestId('menu-reset-all-routes')).toBeEnabled();
  await page.getByTestId('menu-reset-all-routes').click();
  await expect(editor).not.toContainText('waypoint (140, 30)');
  await expect(editor).toContainText('position a (40, 40)');
  expect(await transforms(page)).toEqual(before);

  // Undo restores the cleared routes without touching geometry.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor).toContainText('waypoint (140, 30)');
  await page.reload();
  await expect(page.locator('g.pc-obj')).toHaveCount(2);

  await capture(page, 'remove-named-views-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'remove-named-views-dark');
  const a11y = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('legacy named view syntax is rejected with an actionable diagnostic', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText('pcd 1.0\nview "Old" {\n  layout saved\n}\n');
  await expect(page.locator('.cm-content')).toContainText('view "Old"');
  await expect(page.getByTestId('problem-chip')).toContainText('problem', { timeout: 15_000 });
  await expect(page.getByTestId('problem-item').first()).toContainText('E117');
});
