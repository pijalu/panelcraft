// SPDX-License-Identifier: GPL-3.0-only
// UX-06: equal-size resize snapping, transient visual/accessible cues,
// commit/cancel cleanup, unified undo and durable PDL geometry.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture } from './lib/screenshots';
import { chooseAppMenu, openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0
system target "Target" {
  size 120 60
}
system wide "Width reference" {
  size 200 100
}
system tall "Height reference" {
  size 160 96
}
layout saved
position target (100, 100)
position wide (440, 120)
position tall (440, 360)
`;

async function seedDoc(page: Page, text = DOC): Promise<void> {
  await openWorkspacePanels(page, ['code']);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="target"]')).toBeVisible();
}

async function geometry(page: Page, id = 'target'): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.getByTestId('canvas').locator(`g.pc-obj[data-id="${id}"]`).evaluate((g) => {
    const match = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
    const shape = g.querySelector('rect.pc-shape');
    if (!match || !shape) throw new Error('missing object geometry');
    return {
      x: Number(match[1]), y: Number(match[2]),
      w: Number(shape.getAttribute('width')), h: Number(shape.getAttribute('height')),
    };
  });
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

async function beginResize(page: Page, handleName: 'e' | 's' | 'se'): Promise<void> {
  const canvas = page.getByTestId('canvas');
  await canvas.locator('g.pc-obj[data-id="target"]').click();
  const handle = canvas.locator(`.pc-resize-handle[data-handle="${handleName}"]`);
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('resize handle has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function moveResize(page: Page, x: number, y: number): Promise<void> {
  const point = await canvasPoint(page, x, y);
  await page.mouse.move(point.x, point.y, { steps: 4 });
}

async function expectTargetSize(page: Page, w: number, h: number): Promise<void> {
  await expect.poll(async () => (await geometry(page)).w).toBe(w);
  await expect.poll(async () => (await geometry(page)).h).toBe(h);
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const violations = result.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(violations, violations.join('\n')).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`UX-06: width, height, both and no-match filmstrip (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await seedDoc(page);

    await beginResize(page, 'e');
    let g = await geometry(page);
    await moveResize(page, g.x + 196, g.y + g.h / 2);
    await expectTargetSize(page, 200, 60);
    await expect(page.getByTestId('resize-cue-width')).toHaveCount(1);
    await expect(page.getByTestId('resize-cue-height')).toHaveCount(0);
    await capture(page, `ux06-width-${theme}`);
    await page.mouse.up();
    await expect(page.locator('.pc-resize-cue')).toHaveCount(0);

    await beginResize(page, 's');
    g = await geometry(page);
    await moveResize(page, g.x + g.w / 2, g.y + 92);
    await expectTargetSize(page, 200, 96);
    await expect(page.getByTestId('resize-cue-width')).toHaveCount(0);
    await expect(page.getByTestId('resize-cue-height')).toHaveCount(1);
    await capture(page, `ux06-height-${theme}`);
    await page.mouse.up();
    await expect(page.locator('.pc-resize-cue')).toHaveCount(0);

    await beginResize(page, 'se');
    g = await geometry(page);
    await moveResize(page, g.x + 196, g.y + 92);
    await expectTargetSize(page, 200, 96);
    await expect(page.getByTestId('resize-cue-width')).toHaveCount(1);
    await expect(page.getByTestId('resize-cue-height')).toHaveCount(1);
    await expect(page.getByTestId('canvas')).toHaveAttribute('aria-description', /Equal width.*Equal height/);
    await capture(page, `ux06-both-${theme}`);
    await test.info().attach(`ux06-${theme}-accessibility`, {
      body: await page.getByTestId('canvas').ariaSnapshot(), contentType: 'text/plain',
    });
    await axe(page);
    await page.mouse.up();
    await expect(page.getByTestId('canvas')).not.toHaveAttribute('aria-description', /.+/);

    await beginResize(page, 'se');
    g = await geometry(page);
    await moveResize(page, g.x + 240, g.y + 140);
    await expect(page.locator('.pc-resize-cue')).toHaveCount(0);
    // UX08-WP06: without a match the active size is still shown and announced.
    await expect(page.getByTestId('size-hint-active')).toHaveText(/^\d+ × \d+$/);
    await expect(page.getByTestId('canvas')).toHaveAttribute('aria-description', /^Size \d+ × \d+$/);
    await capture(page, `ux06-no-match-${theme}`);
    await page.mouse.up();
    await expect(page.getByTestId('canvas')).not.toHaveAttribute('aria-description', /.+/);
  });
}

test('UX-06: snapped dimensions persist and remain one undoable resize', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC.replace('size 200 100', 'size 208 104').replace('size 160 96', 'size 160 200'));
  await beginResize(page, 'se');
  const g = await geometry(page);
  await moveResize(page, g.x + 200, g.y + 100);
  await expectTargetSize(page, 208, 104);
  await expect(page.getByTestId('resize-cue-width')).toHaveCount(1);
  await expect(page.getByTestId('resize-cue-height')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await expect(page.locator('.cm-content')).toContainText('size 208 104');
  await expect(page.locator('.pc-resize-cue')).toHaveCount(0);

  await chooseAppMenu(page, 'history-open');
  await page.getByTestId('history-undo').click();
  await expect(page.locator('.cm-content')).toContainText('size 120 60');
  await expectTargetSize(page, 120, 60);
  await page.getByTestId('history-redo').click();
  await expect(page.locator('.cm-content')).toContainText('size 208 104');
  await expectTargetSize(page, 208, 104);
  await page.getByTestId('history-close').click();
  await page.reload();
  await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="target"]')).toBeVisible();
  await expectTargetSize(page, 208, 104);
});

test('UX-06: Escape removes cues without committing resize geometry', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page);
  await beginResize(page, 'e');
  const g = await geometry(page);
  await moveResize(page, g.x + 196, g.y + g.h / 2);
  await expect(page.getByTestId('resize-cue-width')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pc-resize-cue')).toHaveCount(0);
  await expect(page.getByTestId('canvas')).not.toHaveAttribute('aria-description', /.+/);
  await page.mouse.up();
  await expect(page.locator('.cm-content')).toContainText('size 120 60');
  await page.reload();
  await expectTargetSize(page, 120, 60);
});

test('UX08-WP06: a multi-selection shows a hint per selected object, only the dragged one resizes', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page);
  const canvas = page.getByTestId('canvas');
  const target = canvas.locator('g.pc-obj[data-id="target"]');
  await target.click();
  await canvas.locator('g.pc-obj[data-id="wide"]').click({ modifiers: ['Shift'] });
  await expect(canvas.locator('g.pc-obj.pc-selected')).toHaveCount(2);

  // Every selected object exposes its own resize overlay; the passive one keeps
  // its exact model size while the dragged one changes.
  const handle = canvas.locator('.pc-resize-handle[data-id="target"][data-handle="e"]');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) throw new Error('resize handle has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const g = await geometry(page);
  await moveResize(page, g.x + 236, g.y + g.h / 2);
  await expect.poll(async () => (await geometry(page)).w).not.toBe(120);

  // The badge states the live size of the dragged object, whatever the grid
  // rounded it to; the passive member keeps its own size.
  const resized = await geometry(page);
  await expect(page.getByTestId('size-hint-active')).toHaveAttribute('data-id', 'target');
  await expect(page.getByTestId('size-hint-active')).toHaveText(
    `${Math.round(resized.w)} × ${Math.round(resized.h)}`,
  );
  await expect(page.getByTestId('size-hint-wide')).toHaveText('200 × 100');
  await expect(canvas.locator('.pc-size-hint')).toHaveCount(2);
  // The passive member never changes size.
  await expect.poll(async () => (await geometry(page, 'wide')).w).toBe(200);
  await capture(page, 'ux08-resize-hints-multi-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'ux08-resize-hints-multi-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // Escape restores the geometry and removes every hint.
  await page.keyboard.press('Escape');
  await expect(canvas.locator('.pc-size-hint')).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(async () => (await geometry(page)).w).toBe(120);
  await expect(page.locator('.cm-content')).toContainText('size 120 60');
});
