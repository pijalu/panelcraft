// SPDX-License-Identifier: GPL-3.0-only
// Browser assessment round 3: selected step properties, click-driven beats,
// and the responsive delay inspector are verified in Chromium, not inferred
// from component tests.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const FLOW_DOC = `pcd 1.0

person user "Shopper"
system shop "Webshop"

user -> shop as browse

flow "Checkout" as checkout {
  intro "Start"
  user -> shop : "Browse" as browse
  process shop "Pick"
  info "Note one"
  info "Note two"
  info "Note three"
  info "Note four"
  info "Note five"
  info "Note six"
  info "Note seven"
  info "Note eight"
  info "Note nine"
  info "Note ten"
  conclusion "Done"
}
`;

const CLICK_DOC = `pcd 1.0

person user "Shopper"
system shop "Webshop"

user -> shop as browse

flow "Checkout" as checkout {
  intro "Start" delay 500 advance click
  user -> shop : "Browse" as browse
  conclusion "Done"
}
`;

async function seed(page: Page, doc: string, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(doc);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.getByTestId('collapse-code').click();
  await page.getByTestId('flow-row-checkout').click();
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
  expect(violations, violations.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`selected step reveals its inspector without scrolling (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, FLOW_DOC, theme);
    const panel = page.locator('[data-panel="flows"]');
    await page.getByTestId('step-2').click();
    const inspector = page.getByTestId('step-inspector');
    await expect(inspector).toBeVisible();
    await expect.poll(async () => {
      const box = await inspector.boundingBox();
      const host = await panel.boundingBox();
      return box !== null && host !== null && box.y >= host.y - 1 && box.y < host.y + host.height;
    }).toBe(true);
    await expect(page.getByTestId('insp-description')).toHaveValue('');
    await expect(page.getByTestId('insp-advance')).toBeVisible();
    await capture(page, `round3-inspector-${theme}`);
    await axe(page);
  });
}

test('a click-driven beat cycles until the presentation advances', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, CLICK_DOC);
  await page.getByTestId('step-0').click();
  await expect(page.getByTestId('insp-advance')).toHaveValue('click');
  await page.getByTestId('flow-play-checkout').click();
  await page.getByTestId('pb-present').click();
  await expect(page.getByTestId('present-dock')).toBeVisible();
  const counter = page.getByTestId('present-counter');
  await expect(counter).toContainText('1 / 3');
  // The first beat's 500 ms dwell elapsed twice; it stayed on the step.
  await page.waitForTimeout(1400);
  await expect(counter).toContainText('1 / 3');
  await page.getByTestId('present-advance').click();
  await expect(counter).toContainText('2 / 3');
  await capture(page, 'round3-click-advance');
  await axe(page);
});
