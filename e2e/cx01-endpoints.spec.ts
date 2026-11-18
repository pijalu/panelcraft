// SPDX-License-Identifier: GPL-3.0-only
// CX-01: perimeter-locked endpoint dragging across entity kinds, route modes,
// waypoint editing, resizing, history, persistence and SVG/PNG export.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { chooseAppMenu, chooseExport, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

person source "Customer" {
  size 160 100
}
datastore target "Orders" {
  size 180 120
}

source -> target as L1 {
  label "place order"
  waypoint (360, 180)
}

layout saved
position source (100, 120)
position target (500, 300)
`;

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(2);
}

async function canvasPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.getByTestId('canvas').evaluate((element, point) => {
    const svg = element as SVGSVGElement;
    const world = svg.querySelector('.pc-world') as SVGGElement;
    const matrix = world.getScreenCTM();
    if (!matrix) throw new Error('canvas is not on screen');
    const p = svg.createSVGPoint();
    p.x = point.x;
    p.y = point.y;
    const screen = p.matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, { x, y });
}

async function selectLink(page: Page): Promise<void> {
  const route = page.getByTestId('canvas').locator('g.pc-link[data-id="L1"] path.pc-route');
  const point = await route.evaluate((el: SVGPathElement) => {
    const local = el.getPointAtLength(el.getTotalLength() * 0.5);
    const ctm = el.getScreenCTM();
    if (!ctm) throw new Error('route has no screen transform');
    return { x: local.x * ctm.a + local.y * ctm.c + ctm.e, y: local.x * ctm.b + local.y * ctm.d + ctm.f };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('link-route')).toBeVisible();
  await expect(page.getByTestId('canvas').locator('.pc-endpoint')).toHaveCount(2);
}

async function dragEndpoint(
  page: Page,
  end: 'from' | 'to',
  x: number,
  y: number,
): Promise<void> {
  const handle = page.getByTestId(`endpoint-${end}`);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`${end} endpoint has no box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const point = await canvasPoint(page, x, y);
  await page.mouse.move(point.x, point.y, { steps: 6 });
}

async function expectRouteAtHandles(page: Page): Promise<void> {
  const canvas = page.getByTestId('canvas');
  const ends = await canvas.locator('g.pc-link[data-id="L1"] path.pc-route').evaluate((el: SVGPathElement) => {
    const first = el.getPointAtLength(0);
    const last = el.getPointAtLength(el.getTotalLength());
    return [first.x, first.y, last.x, last.y];
  });
  const handles = await canvas.locator('.pc-endpoint').evaluateAll((nodes) => nodes.map((n) => [
    Number(n.getAttribute('cx')), Number(n.getAttribute('cy')),
  ]));
  expect(handles).toHaveLength(2);
  expect(ends[0]).toBeCloseTo(handles[0]![0]!, 5);
  expect(ends[1]).toBeCloseTo(handles[0]![1]!, 5);
  expect(ends[2]).toBeCloseTo(handles[1]![0]!, 5);
  expect(ends[3]).toBeCloseTo(handles[1]![1]!, 5);
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`CX-01: endpoint filmstrip, persistence and exports (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);
    await page.getByTestId('collapse-palette').click();
    await page.getByTestId('collapse-sidebar').click();
    const canvas = page.getByTestId('canvas');
    const editor = page.locator('.cm-content');
    await selectLink(page);
    await expect(canvas.locator('.pc-waypoint')).toHaveCount(1);
    await capture(page, `cx01-selected-${theme}`);
    await axe(page);

    // An inside pointer projects to the top side, never into the person bounds.
    await dragEndpoint(page, 'from', 180, 155);
    await expect(page.getByTestId('endpoint-from')).toHaveAttribute('cx', '180');
    await expect(page.getByTestId('endpoint-from')).toHaveAttribute('cy', '120');
    await capture(page, `cx01-drag-preview-${theme}`);
    await axe(page);
    await page.mouse.up();
    await expect(editor).toContainText('anchor from 0.125');

    // An outside pointer clamps to the datastore's exact bottom-left corner.
    await dragEndpoint(page, 'to', 460, 460);
    await capture(page, `cx01-corner-${theme}`);
    await page.mouse.up();
    await expect(editor).toContainText('anchor to 0.75');
    await expectRouteAtHandles(page);

    // One history command restores and reapplies the complete endpoint drag.
    await chooseAppMenu(page, 'history-open');
    await page.getByTestId('history-undo').click();
    await expect(editor).not.toContainText('anchor to 0.75');
    await page.getByTestId('history-redo').click();
    await expect(editor).toContainText('anchor to 0.75');
    await page.getByTestId('history-close').click();
    await page.getByTestId('banner-flash').getByRole('button', { name: 'dismiss' }).click();

    // Existing intermediate waypoints remain freely draggable.
    const waypoint = canvas.locator('.pc-waypoint');
    const wp = await waypoint.boundingBox();
    if (!wp) throw new Error('waypoint has no box');
    await page.mouse.move(wp.x + wp.width / 2, wp.y + wp.height / 2);
    await page.mouse.down();
    await page.mouse.move(wp.x + wp.width / 2 + 32, wp.y + wp.height / 2 + 24, { steps: 5 });
    await page.mouse.up();
    await expect(editor).not.toContainText('waypoint (360, 180)');
    await expect(editor).toContainText('anchor from 0.125');
    await expect(editor).toContainText('anchor to 0.75');

    for (const mode of ['straight', 'curved', 'orthogonal'] as const) {
      await page.getByTestId(`link-route-${mode}`).click();
      await expectRouteAtHandles(page);
      await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
      await expect(page.getByTestId('status-pill')).toHaveAttribute('data-dirty', 'false');
      if (mode === 'curved') {
        await expect(canvas.locator('g.pc-link[data-id="L1"] path.pc-route')).toHaveAttribute('d', / C /);
      }
      await capture(page, `cx01-route-${mode}-${theme}`);
    }

    // Resizing preserves the normalized top-side fraction and moves its exact point.
    await canvas.locator('g.pc-obj[data-id="source"] .pc-shape').click();
    const resize = canvas.locator('.pc-resize-handle[data-handle="e"]');
    const rb = await resize.boundingBox();
    if (!rb) throw new Error('resize handle has no box');
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    const resized = await canvasPoint(page, 324, 170);
    await page.mouse.move(resized.x, resized.y, { steps: 5 });
    await page.mouse.up();
    await expect(editor).toContainText('size 228 100');
    await expect(editor).toContainText('anchor from 0.125');
    await selectLink(page);
    await expect(page.getByTestId('endpoint-from')).toHaveAttribute('cx', '214');
    await expect(page.getByTestId('endpoint-from')).toHaveAttribute('cy', '120');
    await capture(page, `cx01-resized-${theme}`);
    await axe(page);

    await page.reload();
    await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
    await selectLink(page);
    await expect(editor).toContainText('anchor from 0.125');
    await expect(editor).toContainText('anchor to 0.75');
    await expectRouteAtHandles(page);

    const svgDownload = page.waitForEvent('download');
    await chooseExport(page, 'svg');
    const svg = await svgDownload;
    const svgPath = await svg.path();
    if (!svgPath) throw new Error('SVG download has no path');
    const exported = await readFile(svgPath, 'utf8');
    const routeD = await canvas.locator('g.pc-link[data-id="L1"] path.pc-route').getAttribute('d');
    expect(exported).toContain(`d="${routeD}"`);
    expect(exported).toContain('place order');

    const pngDownload = page.waitForEvent('download');
    await chooseExport(page, 'png');
    const png = await pngDownload;
    const pngPath = await png.path();
    if (!pngPath) throw new Error('PNG download has no path');
    const bytes = await readFile(pngPath);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
}
