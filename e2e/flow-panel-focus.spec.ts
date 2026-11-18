// SPDX-License-Identifier: GPL-3.0-only
// One Properties panel, one subject. Picking a flow step shows that step's
// properties; touching the diagram hands the panel back to what the user is
// pointing at. The two selections are mutually exclusive in both directions,
// and a press on a connector counts as touching the diagram — the panel must
// not be stuck on a flow step just because the press landed on geometry.
import { expect, test, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

person user "Shopper"
system shop "Webshop"
system erp "ERP"

user -> shop as L1
shop -> erp as L2

layout saved
position user (120, 120)
position shop (360, 120)
position erp (600, 120)

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

async function seed(page: Page): Promise<void> {
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await seedCode(page, DOC);
  await settle(page);
  await page.getByTestId('collapse-code').click();
  await page.getByTestId('flow-row-checkout').click();
}

/** Point inside the canvas, in its own coordinates. */
async function canvasPoint(page: Page, dx: number, dy: number): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + dx, y: box.y + dy };
}

test('picking a step takes the panel, touching the diagram gives it back', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await seed(page);

  // A flow pick opens the flow's own properties.
  await expect(page.getByTestId('flow-properties')).toBeVisible();
  await expect(page.getByTestId('step-inspector')).toHaveCount(0);

  // A step pick replaces them: the panel has one subject, never two.
  await page.getByTestId('step-1').click();
  await expect(page.getByTestId('step-panel')).toBeVisible();
  await expect(page.getByTestId('step-inspector')).toBeVisible();
  await expect(page.getByTestId('flow-properties')).toHaveCount(0);

  // Pressing empty canvas ends the flow edit; the column falls back to the
  // canvas's own Properties (here: nothing selected), never to the flow.
  const empty = await canvasPoint(page, 40, 560);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId('step-panel')).toHaveCount(0);
  await expect(page.getByTestId('flow-properties')).toHaveCount(0);
  await expect(page.getByTestId('properties')).toBeVisible();
  // The step list stays: it is the way back into the flow.
  await expect(page.getByTestId('step-1')).toBeVisible();
});

test('a press on a connector also leaves the step', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await seed(page);
  await page.getByTestId('step-1').click();
  await expect(page.getByTestId('step-inspector')).toBeVisible();

  // L1 runs from `user` to `shop`, along the vertical centre of both shapes.
  const canvas = page.getByTestId('canvas');
  const route = canvas.locator('g.pc-link[data-id="L1"] path.pc-route').first();
  await expect(route).toBeVisible();
  const box = (await route.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // The connector is now the subject of the panel — not the flow step.
  await expect(page.getByTestId('link-label')).toBeVisible();
  await expect(page.getByTestId('step-panel')).toHaveCount(0);
  await expect(page.getByTestId('flow-properties')).toHaveCount(0);
});

test('an object press shows object properties, not the flow step', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await seed(page);
  await page.getByTestId('step-2').click();
  await expect(page.getByTestId('step-inspector')).toBeVisible();

  await page.getByTestId('canvas').locator('g.pc-obj[data-id="shop"]').click();
  await expect(page.getByTestId('prop-name')).toHaveValue('Webshop');
  await expect(page.getByTestId('step-panel')).toHaveCount(0);
  await expect(page.getByTestId('flow-properties')).toHaveCount(0);
});
