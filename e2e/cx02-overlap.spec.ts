// SPDX-License-Identifier: GPL-3.0-only
// CX-02: deterministic object/connector avoidance, per-link and manual exceptions.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { chooseAppMenu, chooseExport, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0

system a "A" {
  size 160 60
}
system b "B" {
  size 160 60
}
system blocker "Blocker" {
  size 100 100
}

a -> b as L1
a -> b as L2

view "Default" {
  layout saved
  position a (40, 100)
  position b (520, 100)
  position blocker (280, 80)
}
`;

const BLOCKED_DOC = DOC
  .replace('size 100 100', 'size 900 500')
  .replace('position blocker (280, 80)', 'position blocker (-100, -100)');

async function setDoc(page: Page, source: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(source);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

async function seedDoc(page: Page): Promise<void> {
  await openWorkspacePanels(page);
  await expect(page.locator('.cm-content')).toContainText('pcd 1.0');
  await setDoc(page, DOC);
  await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(3);
  await page.getByTestId('collapse-palette').click();
  await page.getByTestId('collapse-sidebar').click();
}

function route(page: Page, id: string) {
  return page.getByTestId('canvas').locator(`g.pc-link[data-id="${id}"] path.pc-route`);
}

function routePoints(d: string): Array<{ x: number; y: number }> {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).reduce<Array<{ x: number; y: number }>>((points, value, index, values) => {
    if (index % 2 === 0) points.push({ x: value, y: values[index + 1]! });
    return points;
  }, []);
}

function expectOrthogonalEndpoints(d: string): void {
  const points = routePoints(d);
  expect(points.slice(1).every((point, index) => point.x === points[index]!.x || point.y === points[index]!.y)).toBe(true);
  expect(points[1]!.y).toBe(points[0]!.y);
  expect(points.at(-2)!.y).toBe(points.at(-1)!.y);
}

async function selectLink(page: Page, id: string): Promise<void> {
  const path = route(page, id);
  const point = await path.evaluate((el: SVGPathElement) => {
    const local = el.getPointAtLength(el.getTotalLength() * 0.1);
    const ctm = el.getScreenCTM();
    if (!ctm) throw new Error('route has no screen transform');
    return { x: local.x * ctm.a + local.y * ctm.c + ctm.e, y: local.x * ctm.b + local.y * ctm.d + ctm.f };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('link-allow-overlap')).toBeVisible();
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`CX-02: avoidance, exceptions, persistence and exports (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);
    const first = await route(page, 'L1').getAttribute('d');
    const second = await route(page, 'L2').getAttribute('d');
    expect(first).toContain('192');
    expect(second).toContain('56');
    expect(second).not.toEqual(first);
    expectOrthogonalEndpoints(first!);
    expectOrthogonalEndpoints(second!);
    await selectLink(page, 'L2');
    await expect(page.getByTestId('link-allow-overlap')).not.toBeChecked();
    await capture(page, `cx02-automatic-${theme}`);
    await axe(page);

    // SVG and PNG use the exact same committed route geometry as the canvas.
    const svgDownload = page.waitForEvent('download');
    await chooseExport(page, 'svg');
    const svgPath = await (await svgDownload).path();
    if (!svgPath) throw new Error('SVG download has no path');
    expect(await readFile(svgPath, 'utf8')).toContain(`d="${second}"`);
    const pngDownload = page.waitForEvent('download');
    await chooseExport(page, 'png');
    const pngPath = await (await pngDownload).path();
    if (!pngPath) throw new Error('PNG download has no path');
    expect((await readFile(pngPath)).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    await page.getByTestId('link-allow-overlap').check();
    await expect(page.locator('.cm-content')).toContainText('allow overlap');
    await expect(route(page, 'L2')).toHaveAttribute('d', /200[ ,]+130.*520[ ,]+130/);
    await capture(page, `cx02-allowed-${theme}`);
    await axe(page);

    await chooseAppMenu(page, 'history-open');
    await page.getByTestId('history-undo').click();
    await expect(page.locator('.cm-content')).not.toContainText('allow overlap');
    await expect(route(page, 'L2')).toHaveAttribute('d', second!);
    await page.getByTestId('history-redo').click();
    await expect(page.locator('.cm-content')).toContainText('allow overlap');
    await page.getByTestId('history-close').click();
    const flash = page.getByTestId('banner-flash').getByRole('button', { name: 'dismiss' });
    if (await flash.isVisible()) await flash.click();

    await page.reload();
    await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(3);
    await selectLink(page, 'L2');
    await expect(page.getByTestId('link-allow-overlap')).toBeChecked();
    await expect(page.locator('.cm-content')).toContainText('allow overlap');

    // A manual waypoint is authoritative even without the overlap override.
    await setDoc(page, DOC.replace('a -> b as L2\n', 'a -> b as L2 {\n  waypoint (330, 130)\n}\n'));
    await expect(route(page, 'L2')).toHaveAttribute('d', /330[ ,]+130/);
    await selectLink(page, 'L2');
    await expect(page.getByTestId('link-allow-overlap')).not.toBeChecked();
    await capture(page, `cx02-manual-waypoint-${theme}`);
    await axe(page);

    // Endpoint and object edits recompute the same deterministic avoidance.
    await setDoc(page, DOC.replace('position a (40, 100)', 'position a (40, 160)'));
    await expect(route(page, 'L2')).toHaveAttribute('d', /200[ ,]+190/);
    await expect(route(page, 'L2')).toHaveAttribute('d', /204/);
    expectOrthogonalEndpoints((await route(page, 'L2').getAttribute('d'))!);
    expect(await route(page, 'L2').getAttribute('d')).not.toBe(await route(page, 'L1').getAttribute('d'));
    await capture(page, `cx02-object-endpoint-edit-${theme}`);

    // A completely blocked field is an explicit best-effort fallback, not a hang.
    await setDoc(page, BLOCKED_DOC);
    await expect(route(page, 'L2')).toHaveAttribute('d', 'M 200 130 L 520 130');
    expect(await route(page, 'L2').evaluate((el: SVGPathElement) => el.getTotalLength())).toBe(320);
    await capture(page, `cx02-unavoidable-${theme}`);
    await axe(page);
  });
}
