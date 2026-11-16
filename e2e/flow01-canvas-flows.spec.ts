// SPDX-License-Identifier: GPL-3.0-only
// FLOW-01: flows are edited in an on-demand Flow Steps panel, driven by the
// canvas (pick source/target/connector, highlight participants) while the PDL
// stays the single source of truth. No permanent Flows tab, no invented links.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person user "Shopper"
system shop "Webshop" {
  z 1
}
system erp "ERP"

user -requests-> shop as L1
shop -requests-> erp as L2

view "Base" {
  layout saved
  position user (60, 80)
  position shop (300, 80)
  position erp (540, 80)
}
`;

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page, ['code']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.getByTestId('view-select').selectOption('Base');
  // The code panel takes canvas width; keep the three objects clickable.
  await page.getByTestId('collapse-code').click();
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

async function openFlows(page: Page): Promise<void> {
  await openWorkspacePanels(page, ['flows']);
  await expect(page.getByTestId('flow-pane')).toBeVisible();
}

/** Let the parse→apply pipeline land before the next independent edit. */
async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-state-rail')).toHaveAttribute('data-sync-state', 'clean');
  await page.waitForTimeout(250);
}

for (const theme of ['light', 'dark'] as const) {
  test(`FLOW-01: canvas-assisted flow editing (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);

    // The Flow Steps panel is on demand: there is no permanent Flows tab/view.
    await expect(page.locator('[data-panel="sidebar"]')).toHaveCount(0);
    await expect(page.locator('[data-panel="flows"]')).toHaveCount(0);
    await openFlows(page);
    await capture(page, `flow01-panel-opened-${theme}`);

    // Create a flow, then build a message step from the selected connector.
    await page.getByTestId('flow-add').click();
    await expect(page.getByTestId('flow-pane')).toContainText('New flow');
    // New flows snapshot existing links. Hide both cards to exercise the explicit
    // canvas-selection authoring path from an empty message projection.
    await expect(page.getByTestId('step-0')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('hide-connection-0').click();
    await expect(page.getByTestId('step-row-0')).toHaveCount(1, { timeout: 15_000 });
    await settle(page);
    await page.getByTestId('hide-connection-0').click();
    await expect(page.getByTestId('step-row-0')).toHaveCount(0, { timeout: 15_000 });
    // A flow edit reloads the canvas, which clears the connector selection.
    await settle(page);
    await page.getByTestId('canvas').locator('g.pc-link[data-id="L2"] path.pc-route').click({ force: true });
    await expect(page.getByTestId('add-msg')).toBeEnabled();
    await page.getByTestId('add-msg').click();
    await expect(page.getByTestId('step-0')).toContainText('msg');

    // Cards name the shapes: no id memorisation on the common path.
    await expect(page.getByTestId('step-summary-0')).toContainText('Webshop → ERP');

    // Re-target from the canvas: pick the "to" object, then the connector.
    await page.getByTestId('step-0').click();
    await settle(page);
    await page.getByTestId('canvas').locator('g.pc-obj[data-id="erp"]').click();
    await page.getByTestId('insp-pick-to').click();
    await expect(page.getByTestId('step-summary-0')).toContainText('Webshop → ERP');
    await page.getByTestId('canvas').locator('g.pc-link[data-id="L1"] path.pc-route').click({ force: true });
    await page.getByTestId('insp-pick-link').click();
    await expect(page.getByTestId('step-summary-0')).toContainText('Shopper → Webshop');

    // Cards summarise actors; selecting one highlights its participants.
    await page.getByTestId('step-0').click();
    await expect(page.getByTestId('step-0')).toHaveAttribute('aria-current', 'true');
    const faded = page.getByTestId('canvas').locator('.pc-obj.pc-faded');
    await expect(faded).toHaveCount(1); // "erp" is not part of the message
    await expect(faded).toHaveAttribute('data-id', 'erp');
    // Only the connector that the message does not use is faded.
    await expect(page.getByTestId('canvas').locator('.pc-link.pc-faded')).toHaveAttribute('data-id', 'L2');
    await capture(page, `flow01-card-highlight-${theme}`);
    await axe(page);

    // A block step clears the highlight and still edits inline.
    await page.getByTestId('advanced-steps').locator('summary').click();
    await page.getByTestId('add-alt').click();
    await expect(page.getByTestId('step-1')).toContainText('alt');
    await page.getByTestId('step-1').click();
    await expect(page.getByTestId('flow-inspector')).toBeVisible();
    await page.getByTestId('insp-alt-label').fill('payment');
    await expect(page.getByTestId('step-1')).toContainText('payment');
    await page.getByTestId('insp-branch-add').click();
    await expect(page.getByTestId('step-summary-1')).toContainText('2 branches');
    // A block step has no canvas participants, so the highlight clears.
    await page.getByTestId('step-1').click();
    await expect(page.getByTestId('canvas').locator('.pc-faded')).toHaveCount(0);
    await capture(page, `flow01-nested-${theme}`);

    // Reorder with the inspector arrows and confirm the file order changed.
    await page.getByTestId('step-1').click();
    await page.getByTestId('step-up').click();
    await expect(page.getByTestId('step-0')).toContainText('alt');
    await expect(page.getByTestId('step-1')).toContainText('msg');

    // Playback still works from the panel and from a card.
    await page.getByTestId('step-play-1').click();
    await expect(page.getByTestId('playbar')).toBeVisible();
    await expect(page.getByTestId('pb-progress')).toBeVisible();
    await page.getByTestId('pb-exit').click();

    // Sequence export still ships the flow.
    const pending = page.waitForEvent('download');
    await page.getByTestId('flow-export-seq').click();
    const seqPath = await (await pending).path();
    if (!seqPath) throw new Error('sequence download has no path');
    expect(await readFile(seqPath, 'utf8')).toContain('sequenceDiagram');

    // Floating Flow Steps keeps working from the same panel framework.
    await page.getByTestId('panel-menu-flows').click();
    await page.getByTestId('dock-flows-float').click();
    await expect(page.locator('[data-panel="flows"]')).toHaveAttribute('data-dock', 'float');
    await page.getByTestId('step-1').click();
    await expect(page.getByTestId('flow-inspector')).toBeVisible();
    await capture(page, `flow01-floating-${theme}`);
    await axe(page);
    await page.getByTestId('panel-menu-flows').click();
    await page.getByTestId('dock-flows-right').click();

    // Code editing and the panel stay two views of one document.
    await openWorkspacePanels(page, ['code']);
    await page.locator('.cm-content').click();
    await page.locator('.cm-content').press('ControlOrMeta+a');
    await page.keyboard.insertText(DOC.replace('view "Base"', 'flow "Named" as named {\n  intro "hello"\n}\n\nview "Base"'));
    await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
    await expect(page.getByTestId('flow-row-named')).toContainText('Named');

    // Reload keeps document and panel state (selection is session-only).
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.locator('.cm-content')).toContainText('flow "Named"');
    await openFlows(page);
    await page.getByTestId('flow-row-named').click();
    await expect(page.getByTestId('step-0')).toContainText('intro');
    await capture(page, `flow01-after-reload-${theme}`);
  });
}
