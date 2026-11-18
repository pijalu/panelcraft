// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP08: a link has no inline editor, so double-click, Enter and the context
// menu must all land in the same visible link inspector, with focus in its Label
// field and typing affecting only that link. Object double-click still renames.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

system shop "Shop"
system stock "Stock"

shop -reads-> stock as L1
`;

/** Content-only view, for the round-trip check below. */
function normalise(text: string): string {
  return text
    .replace(/\u200b/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')
    .join('\n');
}

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page, ['code', 'props']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  const editor = page.locator('.cm-content');
  await seedCode(page, text);
  // …and prove the editor holds what was typed: a partially replaced document
  // parses into a different diagram and would make the scenario lie.
  const lines = await editor.locator('.cm-line').allInnerTexts();
  expect(normalise(lines.join('\n')), 'seeded document').toBe(normalise(text));
}

const route = (page: Page) => page.getByTestId('canvas').locator('g.pc-link[data-id="L1"] path.pc-route');

test('UX08-WP08: double-clicking link geometry opens the link inspector focused on Label', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  // A straight route has a zero-height box, so Playwright calls it "hidden":
  // count the geometry instead of asserting visibility on a path.
  await expect(route(page)).toHaveCount(1);

  await route(page).dblclick({ force: true });
  const label = page.getByTestId('link-label');
  await expect(label).toBeVisible();
  await expect(label).toBeFocused();
  // Focus must not select the existing value: typing appends, it does not replace.
  await page.keyboard.type('X');
  await expect(label).toHaveValue('X');
  await expect(page.getByTestId('canvas').locator('g.pc-link[data-id="L1"]')).toHaveClass(
    /pc-link-selected/,
  );
  await capture(page, 'ux08-link-properties-light');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(label).toBeVisible();
  await capture(page, 'ux08-link-properties-dark');
});

test('UX08-WP08: Enter inspects a selected link and edits only that link', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  await route(page).click({ force: true });
  await expect(page.getByTestId('link-head')).toBeVisible();

  await page.keyboard.press('Escape'); // leave the canvas's own focus where it is
  await route(page).click({ force: true });
  await page.keyboard.press('Enter');
  const label = page.getByTestId('link-label');
  await expect(label).toBeFocused();
  await page.keyboard.type('reads stock');
  await expect(label).toHaveValue('reads stock');
  // The document carries the label in PDL's `: "…"` form; objects keep their names.
  await expect(page.locator('.cm-content')).toContainText(': "reads stock"');
  await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"] text.pc-label')).toHaveText(
    'Shop',
  );
});

test('UX08-WP08: the link context menu reaches the same editor', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  await route(page).click({ force: true });
  await expect(page.getByTestId('link-head')).toBeVisible();
  await route(page).click({ force: true, button: 'right' });
  const item = page.getByRole('menuitem', { name: 'Properties' });
  await expect(item).toBeEnabled();
  await item.click();
  await expect(page.getByTestId('link-label')).toBeFocused();
});

test('UX08-WP08: a closed Properties panel comes back before it takes focus', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  // Close the panel entirely: the report was that the request then went nowhere.
  await page.getByTestId('panel-menu-props').click();
  await page.getByTestId('close-props').click();
  await expect(page.getByTestId('link-label')).toHaveCount(0);

  await route(page).dblclick({ force: true });
  await expect(page.getByTestId('link-label')).toBeVisible();
  await expect(page.getByTestId('link-label')).toBeFocused();
});

test('UX08-WP08: object double-click still renames in place (non-regression)', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  // The inspector is showing a link first, so a stale focus it the real risk.
  await route(page).dblclick({ force: true });
  await expect(page.getByTestId('link-label')).toBeFocused();

  await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').dblclick();
  const rename = page.locator('[data-testid="inline-rename"]');
  await expect(rename).toBeVisible();
  await expect(rename).toBeFocused();
  await page.keyboard.type('Storefront');
  await page.keyboard.press('Enter');
  await expect(
    page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"] text.pc-label'),
  ).toHaveText('Storefront');
});
