// SPDX-License-Identifier: GPL-3.0-only
// F-18 flow editing parity: drag-reorder steps, duplicate a step, edit the
// per-step delay and play from a chosen step — every change lands in the code
// view (the file is the source of truth).
import { expect, test, type Page } from '@playwright/test';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person ada "Ada"
system web "Web"

ada -> web as aw

flow "Checkout" as main {
  intro "Kick off"
  ada -> web : "send"
  conclusion "done"
}
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
  await openFlowSteps(page);
  await page.getByTestId('flow-row-main').click();
  await expect(page.getByTestId('step-0')).toBeVisible({ timeout: 5000 });
}

test('F-18: duplicate a step — the file gains a second copy', async ({ page }) => {
  await seed(page);
  await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(3);
  await page.getByTestId('step-dup-0').click();
  await expect(page.getByTestId('flow-steps').locator('li')).toHaveCount(4);
  const content = await page.locator('.cm-content').innerText();
  expect(content.match(/intro "Kick off"/g) ?? []).toHaveLength(2);
});

test('F-18: per-step delay is editable and persists as `delay <ms>`', async ({ page }) => {
  await seed(page);
  // The dwell is a property of the chosen step, so select it first.
  await page.getByTestId('step-0').click();
  await page.getByTestId('step-delay-0').fill('500');
  const content = page.locator('.cm-content');
  await expect(content).toContainText('intro "Kick off" delay 500');
  // (clearing the field is covered by stepDelay.test.ts — an empty number input
  // does not emit a reliable input event through the automation driver)
});

test('F-18: steps drag-reorder and the new order is what the file says', async ({ page }) => {
  await seed(page);
  await page.dragAndDrop('[data-testid="step-row-2"]', '[data-testid="step-row-0"]');
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
  const content = await page.locator('.cm-content').innerText();
  // the conclusion now precedes the intro
  expect(content.indexOf('conclusion "done"')).toBeLessThan(content.indexOf('intro "Kick off"'));
});

test('F-18: play from a step starts the flow there', async ({ page }) => {
  await seed(page);
  await page.getByTestId('step-play-2').click();
  await expect(page.getByTestId('playbar')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('pb-narration')).toHaveText('done', { timeout: 5000 });
  await page.getByTestId('pb-exit').click();
});
