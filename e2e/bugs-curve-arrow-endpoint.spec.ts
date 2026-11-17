// SPDX-License-Identifier: GPL-3.0-only
// Bug: a `curve` route could end with its arrowhead travelling along the target's
// edge (the report showed it pointing down at Shop's lower-left corner) instead
// of into the entity. The regression measures the rendered SVG path's end
// tangent in Chromium, so it covers the geometry the arrowhead actually follows.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

// The reported layout: the target sits below-right of the source, and the two
// boxes do not align on either axis.
const DOC = `pcd 1.0

person customer "Customer"
system shop "Shop"

customer -buys-> shop as L1 {
  label "buys"
  style {
    route curved
  }
}

layout saved
position customer (20, 20)
position shop (408, 305)
`;

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.getByTestId('collapse-code').click();
}

/** Start and end tangents of the rendered path, in user units. */
async function tangents(page: Page): Promise<{ end: { dx: number; dy: number }; start: { dx: number; dy: number } }> {
  const route = page.getByTestId('canvas').locator('g.pc-link[data-id="L1"] path.pc-route');
  await expect(route).toHaveAttribute('d', / C /);
  return route.evaluate((el: SVGPathElement) => {
    const len = el.getTotalLength();
    const near = Math.min(8, len / 4);
    const first = el.getPointAtLength(0);
    const afterStart = el.getPointAtLength(near);
    const beforeEnd = el.getPointAtLength(len - near);
    const last = el.getPointAtLength(len);
    return {
      start: { dx: afterStart.x - first.x, dy: afterStart.y - first.y },
      end: { dx: last.x - beforeEnd.x, dy: last.y - beforeEnd.y },
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a curved connector arrives into the entity, not along its edge (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, theme);
    const { end, start } = await tangents(page);

    // Into the target's left edge: horizontal travel, and rightwards.
    expect(end.dx, `end tangent ${JSON.stringify(end)} travels into the entity`).toBeGreaterThan(0);
    expect(Math.abs(end.dx), `end tangent ${JSON.stringify(end)} is horizontal`)
      .toBeGreaterThan(Math.abs(end.dy) * 3);
    // And it leaves the source's right edge the same way.
    expect(start.dx).toBeGreaterThan(0);
    expect(Math.abs(start.dx)).toBeGreaterThan(Math.abs(start.dy) * 3);

    // The arrowhead is actually attached to that end of the path.
    await expect(page.getByTestId('canvas').locator('g.pc-link[data-id="L1"] path.pc-route'))
      .toHaveAttribute('marker-end', /url\(#pc-marker-/);
    await capture(page, `curve-arrow-${theme}`, { golden: false });
  });
}
