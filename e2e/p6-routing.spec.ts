// SPDX-License-Identifier: GPL-3.0-only
// FR-C8: route selection persists through PDL and reload; all route geometries
// and collision-aware labels are captured for light/dark vision review.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system a "Client"
system b "API"
system c "Worker"
system d "Store"

a -requests-> b as L1 {
  label "submit request"
  waypoint (220, 180)
}
c -publishes-> d as L2 {
  label "audit event"
  style {
    route straight
  }
}
a -> d as L3 {
  label "fallback"
}

view "Default" {
  layout saved
  position a (40, 40)
  position b (400, 40)
  position c (40, 280)
  position d (400, 280)
}
`;

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

async function selectLink(page: Page, id: string): Promise<void> {
  const route = page.getByTestId('canvas').locator(`g.pc-link[data-id="${id}"] path.pc-route`);
  const point = await route.evaluate((el: SVGPathElement) => {
    const local = el.getPointAtLength(el.getTotalLength() * 0.5);
    const ctm = el.getScreenCTM();
    if (!ctm) throw new Error('route has no screen transform');
    return { x: local.x * ctm.a + local.y * ctm.c + ctm.e, y: local.x * ctm.b + local.y * ctm.d + ctm.f };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('link-route')).toBeVisible();
}

test('FR-C8: curved/straight routes persist and render in light and dark themes', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-link')).toHaveCount(3);
  await expect(canvas.locator('g.pc-link[data-id="L2"] path.pc-route')).not.toHaveAttribute('d', / C /);

  await selectLink(page, 'L1');
  await page.getByTestId('link-route-curved').click();
  await expect(canvas.locator('g.pc-link[data-id="L1"] path.pc-route')).toHaveAttribute('d', / C /);
  await expect(page.locator('.cm-content')).toContainText('route curved');

  await page.reload();
  await expect(canvas.locator('g.pc-link')).toHaveCount(3);
  await expect(canvas.locator('g.pc-link[data-id="L1"] path.pc-route')).toHaveAttribute('d', / C /);
  await expect(canvas.locator('g.pc-link[data-id="L2"] path.pc-route')).not.toHaveAttribute('d', / C /);
  await expect(canvas.locator('g.pc-link[data-id="L3"] path.pc-route')).not.toHaveAttribute('d', / C /);
  await page.getByTestId('collapse-code').click();
  await capture(page, 'p6-routing-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'p6-routing-dark');

  await selectLink(page, 'L1');
  await expect(page.getByTestId('link-route-curved').locator('input')).toBeChecked();
  await page.getByTestId('link-route-orthogonal').click();
  await expect(page.getByTestId('link-route-orthogonal').locator('input')).toBeChecked();
  await page.getByTestId('expand-code').click();
  await expect(page.locator('.cm-content')).not.toContainText('route curved');
  await expect(canvas.locator('g.pc-link[data-id="L1"] path.pc-route')).not.toHaveAttribute('d', / C /);
});
