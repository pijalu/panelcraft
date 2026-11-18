// SPDX-License-Identifier: GPL-3.0-only
// Known-value inputs and property hierarchy: one icon combobox, closed-domain
// step targets and task-ordered property sections. Captures light/dark/narrow
// screenshots used by the vision review in docs/archive.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { chooseAppMenu, openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system api "Payments API" {
  icon cloud
}

flow "Checkout" as main {
  intro "start"
  process api
  goto "other.pcd#refund"
}
`;

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'props']);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 5000 });
  await page.getByTestId('collapse-code').click();
  // canvas reflows when the code dock closes; let it settle before clicking a shape
  await page.waitForTimeout(250);
}

async function sectionOrder(page: Page): Promise<string[]> {
  return page.locator('section.prop-section').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.testid?.replace('section-', '') ?? ''),
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`known-value properties and ordered sections (${theme})`, async ({ page }) => {
    await seed(page, theme);
    await page.getByTestId('canvas').locator('g.pc-obj[data-id="api"]').click();
    const props = page.getByTestId('properties');
    await expect(props).toBeVisible();

    // Task order is a DOM fact, not a persisted-preference coincidence.
    expect(await sectionOrder(page)).toEqual(['identity', 'style', 'metadata', 'hierarchy', 'advanced']);
    await expect(page.getByTestId('section-identity').locator('[data-testid="prop-style-icon"]')).toHaveCount(1);

    // One combobox: a single trigger with a value, no second handle editor.
    const trigger = page.getByTestId('prop-style-icon');
    await expect(trigger).toHaveAttribute('role', 'combobox');
    await expect(trigger).toContainText('cloud');
    await expect(page.getByTestId('icon-picker-open')).toHaveCount(0);
    await capture(page, `known-value-sections-${theme}`);

    // Escape closes the listbox and returns focus to the one trigger.
    await trigger.click();
    await expect(page.getByTestId('icon-picker')).toBeVisible();
    await capture(page, `known-value-icon-listbox-${theme}`);
    await page.getByTestId('icon-search').press('Escape');
    await expect(page.getByTestId('icon-picker')).toHaveCount(0);
    expect(await trigger.evaluate((el) => document.activeElement === el)).toBe(true);

    // Picking writes the object's identity icon through the one command.
    await trigger.click();
    await page.getByTestId('icon-search').fill('database');
    await page.getByTestId('icon-option-database').click();
    await openWorkspacePanels(page, ['code']);
    await expect(page.locator('.cm-content')).toContainText('icon database');
  });
}

test('closed-domain step targets use selects', async ({ page }) => {
  await seed(page, 'light');
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });

  await page.getByTestId('step-1').click(); // process api
  await expect(page.getByTestId('insp-target')).toHaveJSProperty('tagName', 'SELECT');
  await capture(page, 'known-value-process-target-light');

  await page.getByTestId('step-2').click(); // goto other.pcd#refund
  await expect(page.getByTestId('insp-goto-file')).toHaveJSProperty('tagName', 'SELECT');
  await expect(page.getByTestId('insp-goto-flow')).toHaveJSProperty('tagName', 'SELECT');
  await capture(page, 'known-value-goto-target-light');
});

test('properties stay readable at a narrow viewport', async ({ page }) => {
  await seed(page, 'light');
  await page.setViewportSize({ width: 420, height: 720 });
  await page.getByTestId('canvas').locator('g.pc-obj[data-id="api"]').click();
  // Below the drawer breakpoint the docks overlay the canvas; open Properties
  // explicitly and verify the single icon combobox still fits and stays usable.
  await chooseAppMenu(page, 'view-panel-props');
  await expect(page.getByTestId('properties')).toBeVisible();
  await expect(page.getByTestId('prop-style-icon')).toBeVisible();
  await capture(page, 'known-value-sections-narrow');
});
