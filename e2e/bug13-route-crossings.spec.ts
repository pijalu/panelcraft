// SPDX-License-Identifier: GPL-3.0-only
// Item 13: validate complete routes, preserve intentional detours.
//
// The two fixtures from the bug report, driven through the real editor:
//   A. the C4 template's automatic `Shop → Payment provider` route, and
//   B. the same document with two authored bends, the second of them inside the
//      payment entity.
//
// Every assertion is made on the *whole* rendered polyline (sampled from the
// route path) against the *rendered* shape and label boxes, in both themes — a
// connector may neither cross a shape nor lose its label, and the authored
// detour it can honour must still be there.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person user "Customer"
system app "Shop" {
  size 57 36
}
system_ext pay "Payment provider"

user -> app : "buys" as L1
app -> pay : "charges" as L2

position app (248, 128)
position pay (348, 52)
position user (40, 40)
`;

/** The report's explicit-path fixture: the second bend sits inside the target. */
const DETOUR = DOC.replace('app -> pay : "charges" as L2\n', `app -> pay : "charges" as L2 {
  waypoint (432, 254)
  waypoint (432, 70)
}
`);

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page, ['code']);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.getByTestId('canvas').locator('text=Payment provider').first().waitFor();
}

/** Screen-space boxes of the drawn shapes, mapped by their id. */
async function shapeBoxes(page: Page): Promise<Record<string, Rect>> {
  return page.getByTestId('canvas').evaluate((root) => {
    const out: Record<string, { left: number; top: number; right: number; bottom: number }> = {};
    for (const g of root.querySelectorAll<SVGGElement>('g.pc-obj[data-id]')) {
      const body = g.querySelector('rect, path, circle');
      if (!body) continue;
      const box = body.getBoundingClientRect();
      out[g.dataset.id!] = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    }
    return out;
  });
}

/** Sampled screen points of one rendered route (canvas space is 100 % here). */
async function routePoints(page: Page, id: string): Promise<Array<{ x: number; y: number }>> {
  return page.getByTestId('canvas').evaluate((root, linkId) => {
    const path = root.querySelector<SVGPathElement>(`g.pc-link[data-id="${linkId}"] path.pc-route`);
    if (!path) throw new Error(`no route for ${linkId}`);
    const ctm = path.getScreenCTM();
    if (!ctm) throw new Error('route has no screen transform');
    const matrix = path.getCTM();
    void matrix;
    const out: Array<{ x: number; y: number }> = [];
    const total = path.getTotalLength();
    for (let i = 0; i <= 200; i++) {
      const local = path.getPointAtLength((total * i) / 200);
      out.push({ x: local.x * ctm.a + local.y * ctm.c + ctm.e, y: local.x * ctm.b + local.y * ctm.d + ctm.f });
    }
    return out;
  }, id);
}

/** Box of one link's label (painted box, as the reader sees it). */
async function labelBox(page: Page, id: string): Promise<Rect> {
  const box = await page.getByTestId('canvas')
    .locator(`g.pc-link-label-group[data-id="${id}"] rect.pc-link-label-bg`)
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    });
  return box;
}

const contains = (r: Rect, p: { x: number; y: number }, slack = 0.5): boolean =>
  p.x > r.left + slack && p.x < r.right - slack && p.y > r.top + slack && p.y < r.bottom - slack;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Shortest screen distance between the label box and the route. */
function gap(label: Rect, route: Array<{ x: number; y: number }>): number {
  let best = Infinity;
  for (const point of route) {
    const dx = Math.max(label.left - point.x, 0, point.x - label.right);
    const dy = Math.max(label.top - point.y, 0, point.y - label.bottom);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`item 13 routes (${colorScheme})`, () => {
    test.use({ colorScheme });

    test('the automatic route avoids every shape and keeps its label adjacent', async ({ page }) => {
      await page.goto('/');
      await seedDoc(page, DOC);

      const shapes = await shapeBoxes(page);
      const charges = await routePoints(page, 'L2');

      for (const [id, box] of Object.entries(shapes)) {
        const hits = charges.filter((p) => contains(box, p));
        expect(hits, `route L2 crosses ${id}`).toEqual([]);
      }

      // Endpoints: the drawn route starts and ends on the two perimeters.
      expect(contains(shapes.app!, charges[0]!)).toBe(false);
      expect(contains(shapes.pay!, charges.at(-1)!)).toBe(false);

      // The label belongs to its own route, and covers no shape.
      const label = await labelBox(page, 'L2');
      expect(gap(label, charges)).toBeLessThanOrEqual(24);
      for (const [id, box] of Object.entries(shapes)) {
        expect(overlaps(label, box), `label L2 covers ${id}`).toBe(false);
      }
      const buys = await labelBox(page, 'L1');
      expect(overlaps(label, buys)).toBe(false);

      await capture(page, `bug13-automatic-route-${colorScheme}`);
    });

    test('the out-and-back detour is simplified and both authored bends are diagnosed', async ({ page }) => {
      await page.goto('/');
      await seedDoc(page, DETOUR);

      const shapes = await shapeBoxes(page);
      const charges = await routePoints(page, 'L2');
      for (const [id, box] of Object.entries(shapes)) {
        expect(charges.filter((p) => contains(box, p)), `route L2 crosses ${id}`).toEqual([]);
      }

      // The authored down-and-back bend is gone: no sampled point sits far
      // below the payment entity, and the route reads like the automatic one.
      expect(charges.some((p) => p.y > shapes.pay!.bottom + 40)).toBe(false);

      // Both reasons are stated on the connector and in its accessible text.
      const warning = page.getByTestId('canvas').locator('g.pc-link[data-id="L2"]');
      await expect(warning).toHaveAttribute('data-route-warning', /makes the route reverse direction/);
      await expect(warning).toHaveAttribute('data-route-warning', /inside Payment provider/);
      await expect(warning).toHaveAttribute('aria-description', /reverse direction/);
      const tooltip = await warning.locator('title').textContent();
      expect(tooltip).toContain('makes the route reverse direction');
      expect(tooltip).toContain('inside Payment provider');

      // The document keeps the authored points: the code view still has both.
      const editorText = await page.locator('.cm-content').innerText();
      expect(editorText).toContain('waypoint (432, 254)');
      expect(editorText).toContain('waypoint (432, 70)');

      const label = await labelBox(page, 'L2');
      expect(gap(label, charges)).toBeLessThanOrEqual(24);
      for (const [id, box] of Object.entries(shapes)) {
        expect(overlaps(label, box), `label L2 covers ${id}`).toBe(false);
      }

      await capture(page, `waypoint-simplification-${colorScheme}`);
    });
  });
}
