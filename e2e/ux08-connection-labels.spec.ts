// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP10 connection labels: a dense diagram must never bury a label under a
// shape, must keep ownership visible, and must keep the whole text reachable for
// assistive tech and hover. The assertions are geometric (client rects in the
// real browser), so wrapping, measurement and layer order are all exercised
// together instead of in isolation.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';
import { capture } from './lib/screenshots';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0
title "Dense labels"

system gateway "Gateway"
system orders "Orders"
system billing "Billing"
system fulfil "Fulfilment"
queue events "Event bus"
datastore ledger "Ledger"
system stock "Stock"

gateway -> orders : "Places orders and captures the payment intent"
orders -> events : "Order placed"
events -> billing : "Charge requested with retry budget"
billing -> ledger : "Writes the debit line"
orders -> fulfil : "Pack and ship"
fulfil -> stock : "Reserve inventory"
stock -> orders : "Backorder signal"

orders -> billing : "Refunds" as REFUND {
  style { route curved }
}
orders -> events : "Audit" as AUDIT {
  style { route straight }
}
`;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function boxes(locator: Locator): Promise<Box[]> {
  const all = await locator.evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }),
  );
  return all.filter((box) => box.w > 0 && box.h > 0);
}

/** One link's visible geometry: its label box and the route it belongs to. */
interface LinkGeometry {
  id: string;
  label: Box;
  route: Box;
}

/**
 * Per-link geometry in client pixels. Fit-to-view frames the objects, so a route
 * that detours outside them can legitimately leave the viewport; the label must
 * follow its route rather than the object bounds.
 */
async function linkGeometry(page: Page): Promise<LinkGeometry[]> {
  return page.getByTestId('canvas').evaluate((svg) =>
    [...svg.querySelectorAll('.pc-link-label-group')].flatMap((group) => {
      const id = group.getAttribute('data-id') ?? '';
      const labelBg = group.querySelector('.pc-link-label-bg');
      const route = svg.querySelector(`g.pc-link[data-id="${CSS.escape(id)}"] path.pc-route`);
      if (labelBg === null || route === null) return [];
      const box = (node: Element): { x: number; y: number; w: number; h: number } => {
        const r = node.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      return [{ id, label: box(labelBg), route: box(route) }];
    }));
}

const inside = (box: Box, view: Box): boolean =>
  box.x >= view.x && box.y >= view.y &&
  box.x + box.w <= view.x + view.w && box.y + box.h <= view.y + view.h;

async function seed(page: Page): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await seedCode(page, DOC);
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(7);
  // The mini-map's Home fits the diagram. It runs after the panels are open, so
  // the fit matches the canvas size the assertions actually measure (the load
  // time fit runs against a wider canvas).
  await page.getByTestId('mini-map').focus();
  await page.keyboard.press('Home');
  await waitForStableView(page);
}

/** Wait until pan/zoom and layout have settled (view fit runs after load). */
async function waitForStableView(page: Page): Promise<void> {
  const snapshot = (): Promise<string> =>
    page.getByTestId('canvas').evaluate((svg) => {
      const world = svg.querySelector('g.pc-world');
      const rect = svg.getBoundingClientRect();
      const labels = [...svg.querySelectorAll('.pc-link-label-bg')]
        .map((l) => `${l.getAttribute('x')},${l.getAttribute('y')}`)
        .join(' ');
      return [world?.getAttribute('transform') ?? 'none',
        rect.left, rect.top, rect.width, rect.height, labels].join('|');
    });
  let previous = '';
  let stable = 0;
  await expect
    .poll(async () => {
      const current = await snapshot();
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (stable < 2) await page.waitForTimeout(150);
      return stable >= 2 ? 'stable' : 'moving';
    }, { timeout: 8000 })
    .toBe('stable');
}

const labels = (page: Page) => page.getByTestId('canvas').locator('.pc-link-label-group');
const objects = (page: Page) => page.getByTestId('canvas').locator('g.pc-obj');

test('UX08-WP10: no dense-diagram label is painted beneath a shape', async ({ page }) => {
  await seed(page);
  await expect(labels(page)).toHaveCount(9);

  const labelBoxes = await boxes(labels(page).locator('.pc-link-label-bg'));
  const objectBoxes = await boxes(objects(page));
  expect(labelBoxes).toHaveLength(9);
  expect(objectBoxes).toHaveLength(7);

  const buried = labelBoxes.flatMap((label, index) =>
    objectBoxes
      .map((object, objectIndex) => ({ label, index, object, objectIndex }))
      .filter((pair) => overlap(pair.label, pair.object)),
  );
  expect(buried).toEqual([]);

  // Labels also stay readable inside the canvas viewport instead of drifting off.
  const view = (await page.getByTestId('canvas').boundingBox())!;
  const viewport: Box = { x: view.x, y: view.y, w: view.width, h: view.height };
  const geometry = await linkGeometry(page);
  expect(geometry).toHaveLength(9);
  const offscreen = geometry
    .filter((link) => inside(link.route, viewport))
    .filter((link) => !inside(link.label, viewport))
    .map((link) => link.id);
  expect(offscreen).toEqual([]);
});

test('UX08-WP10: labels paint above objects but never capture the pointer', async ({ page }) => {
  await seed(page);
  // Order in the scene graph decides paint order: labels sit last, above shapes.
  const order = await page.getByTestId('canvas').evaluate((svg) =>
    [...svg.querySelectorAll('g.pc-layer')].map((layer) => layer.getAttribute('class') ?? ''));
  expect(order.findIndex((c) => c.includes('pc-layer-labels')))
    .toBeGreaterThan(order.findIndex((c) => c.includes('pc-layer-objects')));

  // Painting above is only safe because the label is transparent to the mouse:
  // whatever sits under a label must remain the hit-test result.
  const centre = await labels(page).first().locator('.pc-link-label-bg').boundingBox();
  const hit = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y);
    return node?.closest('.pc-link-label-group') !== null &&
      node?.closest('.pc-link-label-group') !== undefined;
  }, { x: centre!.x + centre!.width / 2, y: centre!.y + centre!.height / 2 });
  expect(hit).toBe(false);
  await expect(labels(page).first()).toHaveCSS('pointer-events', 'none');
});

test('UX08-WP10: wrapped labels keep their full text for AT and hover', async ({ page }) => {
  await seed(page);
  const longest = 'Places orders and captures the payment intent';
  const label = page.getByTestId('canvas').locator('.pc-link-label', { hasText: 'Places orders' });
  await expect(label).toHaveAttribute('aria-label', longest);

  // The painted form wraps to a bounded box instead of running across the canvas.
  const lines = await label.locator('tspan').evaluateAll((nodes) =>
    nodes.map((node) => node.textContent ?? ''));
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join(' ')).toBe(longest);
  const box = await label.locator('xpath=..').locator('.pc-link-label-bg').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(200);

  // Hover still reaches the untruncated text through the route itself.
  await expect(page.getByTestId('canvas').locator('g.pc-link[data-id="REFUND"] path.pc-route title'))
    .toHaveText(/Refunds/);
});

test('UX08-WP10: curved and straight routes label like orthogonal ones', async ({ page }) => {
  await seed(page);
  for (const id of ['REFUND', 'AUDIT']) {
    const d = await page.getByTestId('canvas')
      .locator(`g.pc-link[data-id="${id}"] path.pc-route`).getAttribute('d');
    // Curved routes paint cubics, straight ones a single line segment.
    if (id === 'REFUND') expect(d).toContain('C');
    else expect(d!.match(/[CL]/g)).toEqual(['L']);
    // Both carry a placed label with a non-empty backing box.
    const bg = page.getByTestId('canvas')
      .locator(`.pc-link-label-group[data-id="${id}"] .pc-link-label-bg`);
    await expect(bg).toBeVisible();
    expect(Number(await bg.getAttribute('width'))).toBeGreaterThan(0);
  }
});

test('UX08-WP10: label legibility survives the 10%–400% zoom range', async ({ page }) => {
  await seed(page);
  // Zoom scales geometry with the world transform, so the no-occlusion property
  // must hold at both extremes of the supported range.
  for (const key of ['ControlOrMeta+Equal', 'ControlOrMeta+Equal', 'ControlOrMeta+-']) {
    await page.getByTestId('canvas').click();
    await page.keyboard.press(key);
  }
  await waitForStableView(page);
  const labelBoxes = await boxes(labels(page).locator('.pc-link-label-bg'));
  const objectBoxes = await boxes(objects(page));
  for (const label of labelBoxes) {
    for (const object of objectBoxes) expect(overlap(label, object)).toBe(false);
  }
});

test('UX08-WP10: dense label filmstrip', async ({ page }) => {
  await seed(page);
  await expect(page.getByTestId('canvas').locator('.pc-link-label').first()).toBeVisible();
  await capture(page, 'ux08-connection-labels-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'ux08-connection-labels-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  await test.info().attach('ux08-connection-labels-accessibility', {
    body: await page.getByTestId('canvas').ariaSnapshot(),
    contentType: 'text/plain',
  });
});
