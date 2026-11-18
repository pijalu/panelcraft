// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP14: flow documentation downloads as deterministic Markdown, byte for
// byte identical to the checked-in goldens (selected flow and all flows).
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';
import { capture } from './lib/screenshots';
import { seedCode } from './lib/seed';

const SOURCE = 'testdata/markdown/all-steps.pcd';
const GOLDEN_FLOW = 'testdata/markdown/all-steps.md';
const GOLDEN_FLOWS = 'testdata/markdown/all-flows.md';

async function loadGolden(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await seedCode(page, await readFile(SOURCE, 'utf8'));
  await openFlowSteps(page);
}

async function downloadText(page: import('@playwright/test').Page, testId: string): Promise<{ name: string; text: string }> {
  const pending = page.waitForEvent('download');
  await page.getByTestId(testId).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  return { name: download.suggestedFilename(), text: await readFile(path!, 'utf8') };
}

test('UX08-WP14: the selected flow downloads as the golden Markdown', async ({ page }) => {
  await loadGolden(page);
  await page.getByTestId('flow-row-order').click();
  const file = await downloadText(page, 'flow-export-doc');
  expect(file.name).toBe('untitled.cafe-walkthrough.md');
  expect(file.text).toBe(await readFile(GOLDEN_FLOW, 'utf8'));
});

test('UX08-WP14: all flows download as the golden outline', async ({ page }) => {
  await loadGolden(page);
  const file = await downloadText(page, 'flow-export-docs');
  expect(file.name).toBe('untitled.flows.md');
  expect(file.text).toBe(await readFile(GOLDEN_FLOWS, 'utf8'));
});

test('UX08-WP14: exporting leaves the document untouched', async ({ page }) => {
  await loadGolden(page);
  await page.getByTestId('flow-row-order').click();
  await downloadText(page, 'flow-export-doc');
  await downloadText(page, 'flow-export-docs');
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  const text = (await page.locator('.cm-line').allInnerTexts()).join('\n');
  expect(text).toContain('flow "Café walkthrough ⚡" as order {');
  expect(text).not.toContain('# Café walkthrough');
});

test('UX08-WP14: export actions are visible in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await loadGolden(page);
    // Export belongs to the flow, so the flow's properties hold the actions.
    await page.getByTestId('flow-row-order').click();
    const doc = page.getByTestId('flow-export-doc');
    const seq = page.getByTestId('flow-export-seq');
    await expect(doc).toBeVisible();
    await expect(seq).toBeVisible();
    // Both actions must stay inside the Properties column, not clipped by it.
    const panel = await page.getByTestId('flow-properties').boundingBox();
    for (const action of [doc, seq]) {
      const box = await action.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(panel!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
    }
    // Their section must not overflow horizontally at the default width.
    const section = page.getByTestId('section-flow-share');
    const overflow = await section.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, 'export section overflows').toBeLessThanOrEqual(0);
    await capture(page, `ux08-documentation-actions-${theme}`);
  }
});
