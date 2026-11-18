// SPDX-License-Identifier: GPL-3.0-only
// Secondary/middle-button camera gestures must never become object edits, and a
// moved secondary drag must not be confused with the stationary menu click.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system a "Alpha"
system b "Beta"

a -> b as L1

layout saved
position a (80, 100)
position b (360, 100)
`;

async function seed(page: Page): Promise<string> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  const documentBefore = await editor.textContent();
  await page.getByTestId('collapse-code').click();
  return documentBefore ?? '';
}

async function dragObject(
  page: Page,
  button: 'left' | 'middle' | 'right',
  dx: number,
  dy: number,
): Promise<void> {
  const object = page.getByTestId('canvas').locator('g.pc-obj[data-id="a"]');
  const box = await object.boundingBox();
  if (!box) throw new Error('missing object bounds');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up({ button });
}

for (const theme of ['light', 'dark'] as const) {
  test(`secondary/middle drags pan without edits or menus (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const documentBefore = await seed(page);

    const canvas = page.getByTestId('canvas');
    const world = canvas.locator('.pc-world');
    const object = canvas.locator('g.pc-obj[data-id="a"]');
    await object.click();
    await expect(object).toHaveClass(/pc-selected/);
    const objectsBefore = await canvas.locator('g.pc-obj').evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('transform')),
    );

    await dragObject(page, 'right', 90, 60);
    await expect(world).toHaveAttribute('transform', 'translate(90 60) scale(1)');
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
    await expect(object).toHaveClass(/pc-selected/);
    expect(await canvas.locator('g.pc-obj').evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('transform')),
    )).toEqual(objectsBefore);

    await dragObject(page, 'middle', 30, 20);
    await expect(world).toHaveAttribute('transform', 'translate(120 80) scale(1)');
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
    await capture(page, `canvas-mouse-panning-${theme}`);
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    // A stationary secondary click retains the established editing menu.
    await object.click({ button: 'right' });
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('context-menu')).toHaveCount(0);

    // Existing wheel, keyboard reset, and Space+primary-drag navigation remain.
    const beforeWheel = await world.getAttribute('transform');
    await page.mouse.wheel(0, 100);
    await expect(world).not.toHaveAttribute('transform', beforeWheel ?? '');
    await page.keyboard.press('0');
    await expect(world).toHaveAttribute('transform', 'translate(0 0) scale(1)');
    await page.keyboard.down('Space');
    await dragObject(page, 'left', 10, 15);
    await page.keyboard.up('Space');
    await expect(world).toHaveAttribute('transform', 'translate(10 15) scale(1)');
    await page.getByTestId('expand-code').click();
    expect(await page.locator('.cm-content').textContent()).toBe(documentBefore);
  });
}
