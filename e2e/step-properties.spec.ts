// SPDX-License-Identifier: GPL-3.0-only
// Selected flow-step properties: the inline inspector edits the resolved
// connector's shared animation, keeps endpoint context read-only, and never
// materialises the derived default flow just to change a link style.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

person user "Shopper"
system shop "Webshop"
system erp "ERP"

user -> shop as L1 {
  style {
    sparks 2
    speed 2
  }
}
shop -> erp as L2

layout saved
position user (60, 90)
position shop (300, 90)
position erp (540, 90)

flow "Checkout" as checkout {
  intro "Start"
  user -> shop : "browse"
  user -> shop : "confirm"
  conclusion "Done"
}
`;

async function settle(page: Page): Promise<void> {
  const state = page.locator('[data-testid="sync-state"], [data-testid="sync-state-rail"]');
  await expect(state).toHaveAttribute('data-sync-state', 'clean');
  await page.waitForTimeout(250);
}

async function source(page: Page): Promise<string> {
  await openWorkspacePanels(page, ['code']);
  return (await page.locator('.cm-content').textContent()) ?? '';
}

async function showInspector(page: Page): Promise<void> {
  await page.getByTestId('insp-shared-style').scrollIntoViewIfNeeded();
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await seedCode(page, DOC);
  await page.getByTestId('collapse-code').click();
  await page.getByTestId('flow-row-checkout').click();
  await page.getByTestId('step-1').click();
}

for (const theme of ['light', 'dark'] as const) {
  test(`selected message step properties (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);

    // Endpoints are chosen from the diagram's own shapes (never typed ids), and
    // the shared style is visibly scoped to the connector with the format bounds.
    expect(await page.getByTestId('insp-from').evaluate((el) => el.tagName)).toBe('SELECT');
    expect(await page.getByTestId('insp-to').evaluate((el) => el.tagName)).toBe('SELECT');
    await expect(page.getByTestId('insp-shared-style')).toContainText('every step');
    await expect(page.getByTestId('insp-sparks')).toHaveValue('2');
    await expect(page.getByTestId('insp-speed')).toHaveValue('2');
    await expect(page.getByTestId('insp-sparks')).toHaveAttribute('min', '1');
    await expect(page.getByTestId('insp-sparks')).toHaveAttribute('max', '8');
    await expect(page.getByTestId('insp-speed')).toHaveAttribute('min', '0.25');
    await expect(page.getByTestId('insp-speed')).toHaveAttribute('max', '4');
    await showInspector(page);
    await capture(page, `step-properties-${theme}`);
    await axe(page);

    // Out-of-range input never reaches the file.
    await page.getByTestId('insp-sparks').fill('9');
    await settle(page);
    expect(await source(page)).not.toContain('sparks 9');
    await page.getByTestId('collapse-code').click();

    // The shared style writes through the same retext → onChangeText path as
    // every other flow edit (its undo behaviour is covered by the flow specs).
    await page.getByTestId('insp-sparks').fill('4');
    await settle(page);
    expect(await source(page)).toContain('sparks 4');
    await page.getByTestId('collapse-code').click();

    // The speed edit persists, and the second step sees the same shared style.
    await page.getByTestId('insp-speed').fill('0.5');
    await settle(page);
    await page.getByTestId('step-2').click();
    await expect(page.getByTestId('insp-sparks')).toHaveValue('4');
    await expect(page.getByTestId('insp-speed')).toHaveValue('0.5');
    await showInspector(page);
    await capture(page, `step-properties-shared-${theme}`);
    await axe(page);

    // Reload reads the document values, not any inspector-local state.
    await page.reload();
    await openWorkspacePanels(page, ['flows']);
    await page.getByTestId('flow-row-checkout').click();
    await page.getByTestId('step-1').click();
    await expect(page.getByTestId('insp-sparks')).toHaveValue('4');
    await expect(page.getByTestId('insp-speed')).toHaveValue('0.5');

    if (theme === 'light') {
      await page.setViewportSize({ width: 480, height: 780 });
      await expect(page.getByTestId('insp-shared-style')).toBeVisible();
      const box = await page.getByTestId('insp-shared-style').boundingBox();
      expect(box?.width ?? 481).toBeLessThanOrEqual(480);
      await showInspector(page);
      await capture(page, 'step-properties-narrow');
      await axe(page);
    }
  });
}

test('derived flow connector style does not materialise a flow', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await seedCode(page, DOC.split('flow "Checkout"')[0] ?? '');
  await page.getByTestId('collapse-code').click();

  await expect(page.getByTestId('flow-derived-hint')).toBeVisible();
  await page.getByTestId('flow-row-default').click();
  await page.getByTestId('step-0').click();
  await expect(page.getByTestId('insp-sparks')).toHaveValue('2');
  await page.getByTestId('insp-sparks').fill('5');
  await settle(page);
  expect(await source(page)).toContain('sparks 5');
  expect(await source(page)).not.toContain('flow ');
  await expect(page.getByTestId('flow-derived-hint')).toBeVisible();
  await capture(page, 'step-properties-derived');
});
