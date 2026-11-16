// SPDX-License-Identifier: GPL-3.0-only
// Item 8: a long filename must never hide the file actions. The Files panel row
// must wrap/break the name while the action buttons keep a non-shrinking,
// reachable area, with no horizontal overflow, and the same actions must be on a
// row context menu invoked by right-click and by keyboard.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels, setAppTheme } from './lib/panels';

const LONG = 'extremely-long-unbroken-filename-that-would-overflow-any-panel.pcd';

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  expect(violations, violations.join('\n')).toEqual([]);
}

/** Create a file with `name` in `folder` ('' = workspace root). */
async function createFile(page: Page, folder: string, name: string): Promise<void> {
  if (folder !== '') {
    await page.getByTestId('tree-new-folder').click();
    await page.getByTestId('tree-create-input').fill(folder);
    await page.getByTestId('tree-create-input').press('Enter');
  }
  await page.getByTestId('tree-new-file').click();
  // After creating a folder, the toolbar targets it, so only the name is typed.
  await page.getByTestId('tree-create-input').fill(name);
  await page.getByTestId('tree-create-input').press('Enter');
}

async function seed(page: Page, folder = ''): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page, ['sidebar', 'code']);
  await expect(page.getByTestId('tab-untitled.pcd')).toBeVisible();
  await createFile(page, folder, LONG);
  await expect(page.getByTestId(`tree-row-${folder === '' ? '' : `${folder}/`}${LONG}`)).toBeVisible();
}

test.describe('long filenames and file actions (item 8)', () => {
  test('the name wraps and every action stays inside a narrow panel', async ({ page }) => {
    // A narrow window squeezes the side panel: the reported case.
    await page.setViewportSize({ width: 760, height: 720 });
    await seed(page, 'nested/deeper');
    const rowPath = `nested/deeper/${LONG}`;
    const row = page.getByTestId(`tree-row-${rowPath}`);
    await row.hover();

    const geometry = await row.evaluate((el) => {
      const name = el.querySelector('.tree-name') as HTMLElement;
      const actions = el.querySelector('.tree-actions') as HTMLElement;
      const tree = el.closest('.tree-rows') as HTMLElement;
      const rowBox = el.getBoundingClientRect();
      const actionsBox = actions.getBoundingClientRect();
      const treeBox = tree.getBoundingClientRect();
      return {
        // The name wraps onto a second line instead of being clipped away, and
        // stops there: a row that grows to a column of single letters is not a
        // fix, so the height stays bounded.
        nameLines: Math.round(name.getBoundingClientRect().height / 18),
        fullName: name.getAttribute('title'),
        actionsInsideRow: actionsBox.right <= rowBox.right + 1 && actionsBox.left >= rowBox.left - 1,
        actionsInsideTree: actionsBox.right <= treeBox.right + 1,
        // No horizontal overflow anywhere in the tree.
        treeOverflow: tree.scrollWidth - tree.clientWidth,
        rowHeight: rowBox.height,
      };
    });
    expect(geometry.nameLines).toBeGreaterThan(1);
    expect(geometry.nameLines).toBeLessThanOrEqual(3);
    // The whole name stays discoverable even though the row shows two lines.
    expect(geometry.fullName).toBe(LONG);
    expect(geometry.actionsInsideRow).toBe(true);
    expect(geometry.actionsInsideTree).toBe(true);
    expect(geometry.treeOverflow).toBeLessThanOrEqual(1);

    // Every action is reachable and targets this row.
    await expect(page.getByTestId(`tree-ren-${rowPath}`)).toBeVisible();
    await expect(page.getByTestId(`tree-dup-${rowPath}`)).toBeVisible();
    await expect(page.getByTestId(`tree-del-${rowPath}`)).toBeVisible();
    await axe(page);
    await capture(page, 'item8-long-name-narrow');

    // The same row in dark mode, for the light/dark screenshot review.
    await setAppTheme(page, 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await capture(page, 'item8-long-name-narrow-dark');
    await setAppTheme(page, 'system');
  });

  test('the row context menu offers the same actions, by pointer and keyboard', async ({ page }) => {
    await seed(page);
    const rowPath = LONG;
    const row = page.getByTestId(`tree-row-${rowPath}`);

    // Pointer path: right-click the row.
    await row.click({ button: 'right' });
    const menu = page.getByTestId('tree-context-menu');
    await expect(menu).toBeVisible();
    for (const id of ['open', 'duplicate', 'rename', 'delete']) {
      await expect(page.getByTestId(`tree-ctx-${id}`)).toBeVisible();
    }
    await capture(page, 'item8-row-context-menu');
    await axe(page);

    // Choose Rename: the inline input opens for this row and the menu closes.
    await page.getByTestId('tree-ctx-rename').click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId('tree-rename-input')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tree-rename-input')).toHaveCount(0);
    // Cancelling keeps keyboard focus on the row instead of the document body.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[data-path]')?.getAttribute('data-path') ?? ''))
      .toBe(rowPath);

    // Keyboard path: focus the row label and press the context-menu key chord.
    await row.locator('.tree-name').focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    // Focus goes back to the row that opened it, not to the panel.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[data-path]')?.getAttribute('data-path') ?? ''))
      .toBe(rowPath);
  });

  test('a file operation from the menu still targets its own row', async ({ page }) => {
    await seed(page, 'group');
    const rowPath = `group/${LONG}`;
    const before = await page.getByTestId('tree-row-group').count();
    await page.getByTestId(`tree-row-${rowPath}`).click({ button: 'right' });
    await page.getByTestId('tree-ctx-duplicate').click();
    // Duplicate adds a sibling next to the source row, not to the root.
    await expect(page.getByTestId(`tree-row-group/${LONG.replace('.pcd', ' copy.pcd')}`)).toBeVisible();
    expect(await page.getByTestId('tree-row-group').count()).toBe(before);
  });

  test('the long name survives wrapping for keyboard selection and scrolling', async ({ page }) => {
    // Below 720px the docks turn into overlay drawers (they cover the tree), so a
    // narrow window that still shows both panels is the honest case here.
    await page.setViewportSize({ width: 740, height: 600 });
    await seed(page);
    const name = page.getByTestId(`tree-row-${LONG}`).locator('.tree-name');
    await name.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(`tab-${LONG}`)).toBeVisible();
    // The row keeps its full accessible name even though it renders on two lines.
    expect(await name.getAttribute('aria-label')).toBeNull();
    expect((await name.textContent())?.trim()).toBe(LONG);
  });
});
