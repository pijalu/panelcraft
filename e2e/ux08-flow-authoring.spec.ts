// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP12: a fresh user finds Flows in the default shell, creates a flow,
// names it, builds steps from canvas selection (never by typing ids), describes
// and reorders them, and plays the result. The common path uses keyboard or
// pointer on visible controls only — no View-menu knowledge, no code pane.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const THEMES = ['light', 'dark'] as const;

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

/** Drag two shapes from the palette and link them (setup for the authoring path). */
async function seedShapes(page: Page): Promise<void> {
  await openWorkspacePanels(page, ['palette']);
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  const drops = [
    { kind: 'palette-person', x: box.x + box.width * 0.22, y: box.y + box.height * 0.32 },
    { kind: 'palette-system', x: box.x + box.width * 0.6, y: box.y + box.height * 0.32 },
  ];
  for (const drop of drops) {
    const item = page.getByTestId(drop.kind);
    const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);

  // Link person → system: the halo belongs to the selected shape.
  await canvas.locator('g.pc-obj[data-id="o1"]').click();
  const halo = canvas.locator('.pc-halo[data-side="right"]').first();
  await expect(halo).toBeVisible();
  const hb = (await halo.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const target = (await canvas.locator('g.pc-obj[data-id="o2"]').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);
  // Canvas edits reach the file through the canvas→file bridge (~1 s of idle
  // parse + apply). Wait for the write to land — the flow pane must edit the
  // file after it, or the pending canvas write would overwrite the new flow.
  await openWorkspacePanels(page, ['code']);
  await expect(page.locator('.cm-content')).toContainText('->');
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.waitForTimeout(250);
  await page.getByTestId('collapse-code').click();
  await expect(page.getByTestId('flow-pane')).toBeVisible();
}

/**
 * Let the parse→apply pipeline land before the next independent edit. Each flow
 * edit is a whole-document rewrite, so issuing one while the previous apply is
 * still in flight makes the pane read a stale file (the write-write window in
 * the M4 single writer; recorded in the WP12 evidence).
 */
async function settle(page: Page): Promise<void> {
  await expect(page.getByTestId('sync-state-rail')).toHaveAttribute('data-sync-state', 'clean');
  await page.waitForTimeout(250);
}

/** The raw shape ids, which the cards must never show instead of names. */
async function shapeIds(page: Page): Promise<string[]> {
  return page
    .getByTestId("canvas")
    .locator("g.pc-obj")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id") ?? ""));
}

for (const theme of THEMES) {
  test(`UX08-WP12: fresh-user flow authoring (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.getByTestId('canvas')).toBeVisible();

    // Flows is discoverable from the default shell: a labelled rail, not a
    // closed panel the user has to know about from the View menu.
    await expect(page.getByTestId('rail-flows')).toBeVisible();
    await expect(page.locator('[data-panel="flows"]')).toHaveCount(0);
    await expect(page.getByTestId('rail-flows')).toContainText('flow steps');
    await capture(page, `ux08-flow-authoring-shell-${theme}`);

    // Keyboard: focus the rail toggle and activate it with the keyboard.
    // `locator.press` re-resolves the element before pressing; a separate
    // focus() + page.keyboard.press() loses the keystroke when the pane
    // re-renders in between (the focused node is replaced).
    await page.getByTestId('expand-flows').press('Enter');
    await expect(page.getByTestId('flow-pane')).toBeVisible();
    await expect(page.getByTestId('flow-empty')).toContainText('guided walkthrough');
    await capture(page, `ux08-flow-authoring-empty-${theme}`);

    await seedShapes(page);

    // New flow through the primary action, still by keyboard.
    await page.getByTestId('flow-add').press('Enter');
    // Each structural action round-trips through the file (write → reparse →
    // re-render), which takes seconds on a 2-core CI runner; the default 5 s
    // assertion timeout is too tight for that, not too tight for a human.
    await expect(page.getByTestId('flow-row-flow1')).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await page.getByTestId('flow-title').focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Checkout');
    await settle(page);

    // The existing connector becomes the initial message automatically. Adding
    // another still requires selecting that connector; none is invented.
    await expect(page.getByTestId('step-0')).toContainText('msg', { timeout: 15_000 });
    await expect(page.getByTestId('add-msg')).toBeDisabled();
    await expect(page.getByTestId('flow-needs-link')).toContainText('connector');
    await page.getByTestId('canvas').locator('g.pc-link path.pc-route').click({ force: true });
    await expect(page.getByTestId('add-msg')).toBeEnabled();
    // Canvas selection ends flow editing; with the live Default flow listed
    // alongside custom flows, explicitly return to the flow being authored.
    await page.getByTestId('flow-row-flow1').click();

    // Cards number the steps and name the shapes instead of their ids.
    await expect(page.getByTestId('step-0')).toContainText('msg', { timeout: 15_000 });
    await expect(page.getByTestId('step-number-0')).toHaveText('1');
    const ids = await shapeIds(page);
    const summary = page.getByTestId('step-summary-0');
    await expect(summary).toContainText('→');
    for (const id of ids) await expect(summary).not.toContainText(id);

    // Describe the step (WP11 presentation description, no shadow state).
    await page.getByTestId('step-0').click();
    await page.getByTestId('insp-description').focus();
    await page.keyboard.type('Order placed');
    // The prose lives in the panel; the row stays number, kind and participants.
    await expect(page.getByTestId('insp-description')).toHaveValue('Order placed', { timeout: 15_000 });
    await expect(page.getByTestId('step-0')).not.toContainText('Order placed');
    await settle(page);

    // Visibility belongs to this flow only. The canvas connector survives Hide,
    // and Show restores the same connection at the end of the manual order.
    await page.getByTestId('hide-connection-0').click();  // the selected step's own control
    await expect(page.getByTestId('flow-hidden-links')).toContainText('Hidden connections');
    await expect(page.getByTestId('step-0')).toHaveCount(0);
    await expect(page.getByTestId('canvas').locator('g.pc-link')).toHaveCount(1);
    await capture(page, `ux08-flow-authoring-hidden-${theme}`);
    await page.getByTestId('show-flow-link-0').click();
    await expect(page.getByTestId('step-0')).toContainText('msg', { timeout: 15_000 });
    await expect(page.getByTestId('flow-hidden-links')).toHaveCount(0);
    await settle(page);

    // A process step comes from the selected shape.
    await page.getByTestId('canvas').locator('g.pc-obj[data-id="o2"]').click();
    await expect(page.getByTestId('add-process')).toBeEnabled();
    await page.getByTestId('add-process').click();
    await expect(page.getByTestId('step-summary-1')).not.toContainText('→', { timeout: 15_000 });
    await settle(page);
    await capture(page, `ux08-flow-authoring-simple-${theme}`);

    // Advanced steps stay behind their own disclosure, opened by keyboard.
    await page.getByTestId('advanced-steps').locator('summary').press('Enter');
    await page.getByTestId('add-alt').click();
    await expect(page.getByTestId('step-2')).toContainText('alt', { timeout: 15_000 });
    await page.getByTestId('step-2').click();
    await page.getByTestId('insp-branch-add').click();
    await expect(page.getByTestId('step-summary-2')).toContainText('branches', { timeout: 15_000 });
    await settle(page);
    await capture(page, `ux08-flow-authoring-nested-${theme}`);

    // Message endpoints are closed lists of the diagram's shapes: a reader picks
    // a name, never transcribes an id, and the row keeps diagnosing a stale one.
    await page.getByTestId('step-0').click();
    const from = page.getByTestId('insp-from');
    const to = page.getByTestId('insp-to');
    expect(await from.evaluate((el) => el.tagName)).toBe('SELECT');
    expect(await to.evaluate((el) => el.tagName)).toBe('SELECT');
    const chosen = await from.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
    for (const id of ids) expect(chosen).not.toContain(id);
    await expect(page.getByTestId('step-warn-0')).toHaveCount(0);
    await capture(page, `ux08-flow-authoring-endpoints-${theme}`);

    // Reorder with the same pointer drag/drop interaction used for manual flows.
    await page.getByTestId('step-row-1').dragTo(page.getByTestId('step-row-0'));
    await expect(page.getByTestId('step-0')).toContainText('process');

    // Present plays the flow that is being edited. It is a property of the flow,
    // so choosing the flow (not a step) brings it into the panel.
    await page.getByTestId('flow-row-flow1').click();
    await page.getByTestId('flow-present').click();
    await expect(page.getByTestId('playbar')).toBeVisible();
    await page.getByTestId('pb-exit').click();
    await expect(page.getByTestId('playbar')).toHaveCount(0);
    await page.waitForTimeout(800);
    await axe(page);

    // The document is the single writer: the pane's edits are in the file.
    await expect(page.getByTestId('flow-row-flow1')).toContainText('Checkout', { timeout: 15_000 });
  });
}
