// SPDX-License-Identifier: GPL-3.0-only
// Hosted smoke, items 12, 13 and 14: the fresh-profile grid is visible, connector
// routes avoid the shapes they pass and keep their labels, and entity labels sit
// on their rendered centre — the three geometry claims the hosted site must show,
// measured in the deployed browser rather than read from the source.
import { expect, test, type Page } from '@playwright/test';
import { documentText, openApp, setDocument, shoot } from './lib/hosted';
import { openAppGroup, openWorkspacePanels } from '../e2e/lib/panels';
import { contentBox, type SceneObject } from '../web/src/engine/render/shapes';

const ROUTE_DOC = `pcd 1.0

person user "Customer"
system app "Shop" {
  size 57 36
}
system_ext pay "Payment provider"

user -> app : "buys" as L1
app -> pay : "charges" as L2

layout saved
position app (248, 128)
position pay (348, 52)
position user (40, 40)
`;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const contains = (r: Rect, p: { x: number; y: number }, slack = 0.5): boolean =>
  p.x > r.left + slack && p.x < r.right - slack && p.y > r.top + slack && p.y < r.bottom - slack;

/** Screen boxes of every drawn shape body, keyed by object id. */
async function shapeBoxes(page: Page): Promise<Record<string, Rect>> {
  return page.getByTestId('canvas').evaluate((root) => {
    const out: Record<string, Rect> = {};
    for (const group of root.querySelectorAll<SVGGElement>('g.pc-obj[data-id]')) {
      const body = group.querySelector('rect, path, circle');
      if (!body) continue;
      const box = body.getBoundingClientRect();
      out[group.dataset.id!] = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    }
    return out;
  });
}

/** Sampled screen points along one rendered route. */
async function routePoints(page: Page, id: string): Promise<Array<{ x: number; y: number }>> {
  return page.getByTestId('canvas').evaluate((root, linkId) => {
    const path = root.querySelector<SVGPathElement>(`g.pc-link[data-id="${linkId}"] path.pc-route`);
    if (!path) throw new Error(`no route for ${linkId}`);
    const ctm = path.getScreenCTM();
    if (!ctm) throw new Error('route has no screen transform');
    const points: Array<{ x: number; y: number }> = [];
    const total = path.getTotalLength();
    for (let i = 0; i <= 160; i++) {
      const local = path.getPointAtLength((total * i) / 160);
      points.push({ x: local.x * ctm.a + local.y * ctm.c + ctm.e, y: local.x * ctm.b + local.y * ctm.d + ctm.f });
    }
    return points;
  }, id);
}

test.describe('item 12 — default grid on the hosted build', () => {
  test('a fresh profile paints the dots grid and the menu agrees', async ({ page }) => {
    await openApp(page);
    // A loaded workspace: the preference is adopted once the editor holds a document.
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, 'pcd 1.0\n\nsystem api "API"\nsystem db "DB"\n\napi -> db as L1\n');
    await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
    const grid = page.locator('svg[data-testid="canvas"] rect.pc-grid');
    // The reported defect: a fresh profile painted nothing at all.
    await expect(grid).toBeVisible();
    expect(await grid.getAttribute('fill')).toBe('url(#pc-grid-pattern-dots)');

    // The menu reports the same state, so the grid is a visible preference and not
    // a stray paint. The interactive toggles themselves (`g`, the radio group) are
    // exercised against this same build by `e2e/ux08-grid.spec.ts`.
    await openAppGroup(page, 'menu-group-layout');
    await expect(page.getByTestId('view-grid-dots')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('view-grid-snap')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await shoot(page, 'hosted-item12-grid');

    // Editor-only: the grid never reaches the document.
    expect(await documentText(page)).not.toContain('grid');
    expect(await documentText(page)).toContain('system api');
  });
});

test.describe('item 13 — whole-route validity on the hosted build', () => {
  test('the connector avoids every shape and keeps its label', async ({ page }) => {
    await openApp(page);
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, ROUTE_DOC);
    const shapes = await shapeBoxes(page);
    const charges = await routePoints(page, 'L2');
    expect(Object.keys(shapes).length).toBe(3);
    for (const [id, box] of Object.entries(shapes)) {
      expect(charges.filter((p) => contains(box, p)), `route L2 crosses ${id}`).toEqual([]);
    }
    // The label is painted with its route, not orphaned elsewhere.
    await expect(page.getByTestId('canvas').locator('g.pc-link-label-group[data-id="L2"]')).toHaveCount(1);
    await shoot(page, 'hosted-item13-routes');
  });
});

test.describe('item 14 — entity label centring on the hosted build', () => {
  test('labels sit on their rendered centre for the reported 57x36 shape', async ({ page }) => {
    await openApp(page);
    await openWorkspacePanels(page, ['code']);
    await setDocument(page, ROUTE_DOC);
    const failures: string[] = [];
    for (const [id, name, kind] of [
      ['app', 'Shop', 'system'],
      ['pay', 'Payment provider', 'system_ext'],
    ] as const) {
      const measured = await page.getByTestId('canvas').locator(`g.pc-obj[data-id="${id}"]`).evaluate((group) => {
        const shape = group.querySelector('.pc-shape')!.getBoundingClientRect();
        const lines = [...group.querySelectorAll('text.pc-label')].map((t) => t.getBoundingClientRect());
        return {
          shape: { left: shape.left, top: shape.top, width: shape.width, height: shape.height },
          block: {
            left: Math.min(...lines.map((l) => l.left)),
            right: Math.max(...lines.map((l) => l.right)),
            top: Math.min(...lines.map((l) => l.top)),
            bottom: Math.max(...lines.map((l) => l.bottom)),
          },
        };
      });
      // The expected region comes from the same content-box model the renderer uses.
      const box = contentBox({ id, kind, name, x: 0, y: 0, w: measured.shape.width, h: measured.shape.height } as SceneObject);
      const wantY = measured.shape.top + (box.label.top + box.label.bottom) / 2;
      const gotY = (measured.block.top + measured.block.bottom) / 2;
      const wantX = measured.shape.left + (box.label.left + box.label.right) / 2;
      const gotX = (measured.block.left + measured.block.right) / 2;
      if (Math.abs(gotY - wantY) > 1.5) failures.push(`${id}: label y ${gotY.toFixed(1)} vs model ${wantY.toFixed(1)}`);
      if (Math.abs(gotX - wantX) > 1.5) failures.push(`${id}: label x ${gotX.toFixed(1)} vs model ${wantX.toFixed(1)}`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
    await shoot(page, 'hosted-item14-labels');
  });
});
