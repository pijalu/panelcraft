// SPDX-License-Identifier: GPL-3.0-only
// Bug: the introduction and conclusion rows in Flow Steps had no editor action,
// so the only way to reach their prose was to guess that the flow itself was
// selected in Properties. Real browser evidence: each framing row has a button
// that opens the flow and puts the caret in that one field, and plain row
// selection still shows the step inspector.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system shop "Shop"

ada -> shop as L1

flow "Checkout" as checkout {
  intro "Start"
  ada -> shop : "order"
  conclusion "Done"
}
`;

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
  await openFlowSteps(page);
  await page.getByTestId('flow-row-checkout').click();
}

for (const theme of ['light', 'dark'] as const) {
  test(`framing rows open their own field (${theme})`, async ({ page }) => {
    await seed(page, theme);

    for (const [index, field] of [[0, 'flow-intro'], [2, 'flow-conclusion']] as const) {
      await page.getByTestId(`step-frame-${index}`).click();
      // The flow panel is the one on screen, and the caret is in that field.
      await expect(page.getByTestId('flow-properties')).toBeVisible();
      const focused = page.getByTestId(field);
      await expect(focused).toBeFocused();
      await expect(focused).toHaveValue(index === 0 ? 'Start' : 'Done');
      // Typing continues the prose that the row points at.
      await page.keyboard.type(' now');
      await expect(focused).toHaveValue(index === 0 ? 'Start now' : 'Done now');
      await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
      await capture(page, `framing-row-${index}-${theme}`, { golden: false });
    }

    // Plain row selection keeps the step inspector: the flow fields are not stolen.
    await page.getByTestId('step-1').click();
    await expect(page.getByTestId('step-panel')).toBeVisible();
    await expect(page.getByTestId('flow-properties')).toHaveCount(0);
  });
}
