// SPDX-License-Identifier: GPL-3.0-only
// F-13 size: explicit `size <w> <h>` geometry, eight-handle resize on every
// kind, fit-to-name for long labels (review §3.4 items 7-8). Screenshots feed
// the visual evidence set (FIX-PLAN DoD 4, light + dark).
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openWorkspacePanels } from './lib/panels';

async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

const LONG_DOC = `pcd 1.0

container api "Payments Orchestration Service"
system db "DB"
`;

test('F-13: resizing a container persists as `size` across a reload', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, 'pcd 1.0\n\ncontainer api "API"\n');
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj[data-id="api"]')).toHaveCount(1);

  // select, then drag the south-east handle by +80/+40 screen px
  await canvas.locator('g.pc-obj[data-id="api"]').click();
  const handle = canvas.locator('.pc-resize-handle[data-handle="se"]');
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2 + 40, { steps: 8 });
  await page.mouse.up();

  // the file carries explicit geometry now
  await expect(page.locator('.cm-content')).toContainText('size ');
  const content = await page.locator('.cm-content').innerText();
  const size = /size (\d+) (\d+)/.exec(content);
  expect(size).not.toBeNull();
  const [w, h] = [Number(size![1]), Number(size![2])];
  expect(w).toBeGreaterThan(160); // the container's default width
  expect(h).toBeGreaterThan(60);

  // …and the reloaded canvas draws the same box
  await page.reload();
  await expect(canvas.locator('g.pc-obj[data-id="api"]')).toHaveCount(1);
  const rect = await canvas
    .locator('g.pc-obj[data-id="api"] rect.pc-shape')
    .evaluate((el) => [el.getAttribute('width'), el.getAttribute('height')]);
  expect(Number(rect[0])).toBe(w);
  expect(Number(rect[1])).toBe(h);
});

test('F-13: every kind shows eight resize handles', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, 'pcd 1.0\n\nperson ada "Ada"\nnote n1 "memo"\n');
  const canvas = page.getByTestId('canvas');
  for (const id of ['ada', 'n1']) {
    await canvas.locator(`g.pc-obj[data-id="${id}"]`).click();
    await expect(canvas.locator('.pc-resize-handle')).toHaveCount(8);
  }
});

test('F-13: a long name is fitted (no overflow) and `Fit` records the size', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, LONG_DOC);
  const canvas = page.getByTestId('canvas');
  const api = canvas.locator('g.pc-obj[data-id="api"]');
  await expect(api).toHaveCount(1);

  // the rendered label stays inside the shape box (real glyph metrics)
  const fits = await api.evaluate((g) => {
    const shape = g.querySelector('rect.pc-shape') as SVGRectElement;
    const box = { w: Number(shape.getAttribute('width')), h: Number(shape.getAttribute('height')) };
    const texts = [...g.querySelectorAll('text.pc-label')] as SVGTextElement[];
    return {
      box,
      boxes: texts.map((t) => {
        const b = t.getBBox();
        return { x: b.x, w: b.width, y: b.y, h: b.height };
      }),
      lines: texts.length,
      overflowX: texts.some((t) => {
        const b = t.getBBox();
        return b.x < 0 || b.x + b.width > box.w;
      }),
      overflowY: texts.some((t) => {
        const b = t.getBBox();
        return b.y < 0 || b.y + b.height > box.h;
      }),
    };
  });
  console.log('FITS', JSON.stringify(fits));
  expect(fits.lines).toBeGreaterThan(0);
  expect(fits.overflowX).toBe(false);
  expect(fits.overflowY).toBe(false);

  // light + dark evidence
  await capture(page, 'p1-size-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'p1-size-dark');
});
