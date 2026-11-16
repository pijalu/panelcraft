// SPDX-License-Identifier: GPL-3.0-only
// Item 14: entity labels must be centred by their *rendered* bounds, not by an
// SVG y-attribute the browser then shifts again. The fixture and the failure
// case come from the bug report: a 57x36 Shop shape whose name reads too low.
//
// The expectation comes from the same content-box model the renderer and
// auto-fit use (`contentBox`), so this test fails when the paint drifts away
// from the layout model — which is what a second vertical-positioning model
// (attribute offset plus `dominant-baseline`) causes.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';
import { contentBox, LABEL_LINE_HEIGHT, type SceneObject } from '../web/src/engine/render/shapes';

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const centre = (r: Rect): { x: number; y: number } => ({
  x: (r.left + r.right) / 2,
  y: (r.top + r.bottom) / 2,
});

/** A shape under test: the kind and name the renderer lays out, plus its id. */
interface Subject {
  id: string;
  kind: SceneObject['kind'];
  name: string;
}

const subject = (id: string, kind: SceneObject['kind'], name: string): Subject => ({ id, kind, name });

/**
 * The label region centre of the rendered body, per the layout model. The canvas
 * is at 100 % zoom, so the DOM box *is* the object geometry — no scale guess.
 */
function expectedCentre(shape: Rect, { kind, name }: Subject): { x: number; y: number } {
  const box = contentBox({
    id: 'x', kind, name, x: 0, y: 0, w: shape.width, h: shape.height,
  } as SceneObject);
  return {
    x: shape.left + (box.label.left + box.label.right) / 2,
    y: shape.top + (box.label.top + box.label.bottom) / 2,
  };
}

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page, ['code']);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.fill(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
}

/** Screen-space boxes of one object's shape body and its rendered label lines. */
async function boxes(page: Page, id: string): Promise<{ shape: Rect; lines: Rect[] }> {
  return page.getByTestId('canvas').locator(`g.pc-obj[data-id="${id}"]`).evaluate((group) => {
    const toRect = (r: DOMRect): Rect => ({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    });
    const shape = group.querySelector('.pc-shape');
    if (!shape) throw new Error('object has no shape body');
    const lines = [...group.querySelectorAll('text.pc-label')].map((t) => toRect(t.getBoundingClientRect()));
    return { shape: toRect(shape.getBoundingClientRect()), lines };
  });
}

/** Compare one subject's rendered label bounds with the model region. */
async function assertCentred(page: Page, s: Subject, failures: string[]): Promise<void> {
  const { shape, lines } = await boxes(page, s.id);
  if (lines.length === 0) {
    failures.push(`${s.id}: no label rendered`);
    return;
  }
  const want = expectedCentre(shape, s);
  const block = {
    left: Math.min(...lines.map((l) => l.left)),
    right: Math.max(...lines.map((l) => l.right)),
    top: Math.min(...lines.map((l) => l.top)),
    bottom: Math.max(...lines.map((l) => l.bottom)),
  };
  const got = centre({ ...block, width: 0, height: 0 });
  // Tolerance: the model centres the em box while `getBoundingClientRect` measures
  // the ink box, so a string of caps measures up to ~2 px above the em centre.
  // The defect this guards against was 4 px, so the margin stays meaningful.
  const dx = Math.abs(got.x - want.x);
  const dy = Math.abs(got.y - want.y);
  if (dx > 1) failures.push(`${s.id}: horizontal ${got.x} vs ${want.x}`);
  if (dy > 2) failures.push(`${s.id}: vertical ${got.y} vs ${want.y}`);
  if (block.top < shape.top - 0.5 || block.bottom > shape.bottom + 0.5) failures.push(`${s.id}: clipped`);
  const pitch = lines.length > 1
    ? Math.abs(centre(lines[1]!).y - centre(lines[0]!).y)
    : LABEL_LINE_HEIGHT;
  if (Math.abs(pitch - LABEL_LINE_HEIGHT) > 1) failures.push(`${s.id}: line pitch ${pitch}`);
}

test.describe('entity label centering (item 14)', () => {
  test('the reported 57x36 Shop label is centred on its rendered bounds', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, `pcd 1.0

system app "Shop" {
  size 57 36
  style {
    fill #6a0b53
    text #c2dbff
  }
}
`);
    await expect(page.getByTestId('canvas').locator('g.pc-obj[data-id="app"]')).toHaveCount(1);

    const failures: string[] = [];
    // The report's exact geometry: the shape body really is 57x36.
    const body = await boxes(page, 'app');
    expect(body.shape.width).toBe(57);
    expect(body.shape.height).toBe(36);
    await assertCentred(page, subject('app', 'system', 'Shop'), failures);
    expect(failures).toEqual([]);

    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await capture(page, `label-57x36-${scheme}`);
    }
  });

  test('every shape kind centres its label block in the reported region', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, `pcd 1.0

system plain "Plain System"
container box "Container"
datastore store "Records"
person human "Customer"
queue jobs "Jobs Queue"
note memo "A short note"
system tall "Two line label here" {
  size 120 96
}
`);
    await expect(page.getByTestId('canvas').locator('g.pc-obj')).toHaveCount(7);

    const failures: string[] = [];
    for (const s of [
      subject('plain', 'system', 'Plain System'),
      subject('box', 'container', 'Container'),
      subject('store', 'datastore', 'Records'),
      subject('human', 'person', 'Customer'),
      subject('jobs', 'queue', 'Jobs Queue'),
      subject('memo', 'note', 'A short note'),
      subject('tall', 'system', 'Two line label here'),
    ]) {
      await assertCentred(page, s, failures);
    }
    expect(failures).toEqual([]);
  });

  test('a boundary title stays pinned to its top-left corner', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, `pcd 1.0

group zone "Boundary"
`);
    const { shape, lines } = await boxes(page, 'zone');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.left - shape.left).toBeLessThan(24);
    expect(lines[0]!.top - shape.top).toBeLessThan(28);
  });

  test('multiline labels keep equal air above and below the block', async ({ page }) => {
    await page.goto('/');
    await seedDoc(page, `pcd 1.0

system multiline "First line of the label block" {
  size 96 120
}
`);
    const { shape, lines } = await boxes(page, 'multiline');
    expect(lines.length).toBeGreaterThan(1);
    const top = Math.min(...lines.map((l) => l.top));
    const bottom = Math.max(...lines.map((l) => l.bottom));
    // Equal air above and below is what makes a wrapped block read centred. The
    // allowance covers the ink-box measurement plus the content box's deliberate
    // 6 px / 8 px vertical padding pair.
    expect(Math.abs(top - shape.top - (shape.bottom - bottom))).toBeLessThanOrEqual(5);
  });
});
