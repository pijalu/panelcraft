// SPDX-License-Identifier: GPL-3.0-only
// S2 Code view (SPEC §3.2, M4-WP6): mermaid paste → buffer converts to PDL →
// canvas renders → canvas edit → code view updates (FR-K1/K2, D-M4-4). Plus
// the FR-K5 diverged-close prompt with FR-K4 apply blocking (WP4 acceptance:
// type garbage → save blocked → apply/clear).
import { expect, test } from '@playwright/test';

const MERMAID = 'flowchart TD\n  api[API Server] --> db[(Database)]\n';

test('S2: mermaid paste → canvas → canvas edit → code view updates', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  const codePane = page.getByTestId('code-pane');
  await expect(canvas).toBeVisible();
  await expect(codePane).toBeVisible();
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };

  // ---- paste mermaid into the code view ------------------------------------
  await page.locator('.cm-content').click();
  await page.keyboard.insertText(MERMAID);
  // D-M4-4: the buffer converts to canonical PDL at paste time
  const content = page.locator('.cm-content');
  await expect(content).toContainText('pcd 1.0');
  // idle parse (300 ms) → pending-apply → canvas renders both nodes + link
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2, { timeout: 5000 });
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);
  // machine converged back to clean after the apply
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });

  // ---- canvas edit → code view updates (FR-K2, ≤150 ms + debounce) ---------
  // drag a system from the palette onto the canvas (S1 pattern — a plain
  // click would fire both the click-to-place AND drag-drop paths)
  const item = page.getByTestId('palette-system');
  const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 300, { steps: 8 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  // FR-K2: the code view re-renders from the canvas within the debounce —
  // the buffer swaps to the canvas projection text (meta lines dropped)
  await expect(content).toContainText('System 1', { timeout: 3000 });
  await expect(content).toContainText('container api');
  await expect(content).not.toContainText('direction');
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');

  // light + dark screenshots (vision round input for M4)
  await page.screenshot({ path: 'e2e/__screenshots__/m4-s2-light.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'e2e/__screenshots__/m4-s2-dark.png', fullPage: true });
});

test('S2/WP4: garbage buffer blocks apply; diverged close offers discard', async ({ page }) => {
  await page.goto('/');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('pcd 1.0\nsystem');

  // closing the tab with a diverged buffer must prompt (FR-K5)
  await page.getByTestId('tab-close-untitled.pcd').click();
  const dialog = page.getByTestId('diverged-dialog');
  await expect(dialog).toBeVisible();

  // FR-K4: the unparseable buffer cannot be applied
  await page.getByTestId('diverged-apply').click();
  await expect(page.getByTestId('diverged-error')).toBeVisible();
  await expect(page.getByTestId('diverged-apply')).toBeDisabled();

  // discard keeps the file and closes the tab
  await page.getByTestId('diverged-discard').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('tab-untitled.pcd')).toHaveCount(0);
});
