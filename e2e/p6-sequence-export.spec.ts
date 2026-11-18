// SPDX-License-Identifier: GPL-3.0-only
// M6-WP7: the selected flow downloads as a real Mermaid sequenceDiagram.
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0
person user "Customer"
system shop "Shop"
system api "API"
user -> shop
api -> shop
flow "Checkout" as main {
  intro "Start"
  user -> shop : "submit"
  alt "result" {
    "ok" { process api "capture" }
    "failed" { info "try again" }
  }
  par "receipts" {
    { api -> shop : "event" }
    { process api "email" }
  }
  conclusion "Done"
}
`;

test('M6-WP7: selected flow exports to .seq.mmd', async ({ page }) => {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await openFlowSteps(page);
  await page.getByTestId('flow-row-main').click();
  const pending = page.waitForEvent('download');
  await page.getByTestId('flow-export-seq').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('untitled.seq.mmd');
  const path = await download.path();
  expect(path).not.toBeNull();
  const text = await readFile(path!, 'utf8');
  expect(text).toContain('sequenceDiagram\n  title Checkout');
  expect(text).toContain('actor user as Customer');
  expect(text).toContain('user->>shop: submit');
  expect(text).toContain('alt result — ok');
  expect(text).toContain('par receipts');
  expect(text).toContain('Note over user,api: Done');
});
