// SPDX-License-Identifier: GPL-3.0-only
// P0 defect regressions (docs/FIX-PLAN.md F-01/F-02/F-06/F-07/F-08, review §2
// D1/D2/D5/D6/D7/D8). Every test here failed before the P0 fixes:
//  - a canvas edit replaced the file with an objects+links projection (flows,
//    views, positions, styles, imports, link semantics all vanished),
//  - new objects reused ids already present in the loaded file,
//  - group/note objects were filtered out of the canvas and disappeared,
//  - `dashed` / `bidir` were dropped by the canvas write,
//  - untyped arrows gained `uses`.
import { expect, test, type Page } from '@playwright/test';
import { openWorkspacePanels } from './lib/panels';

const DOC = `pcd 1.0
title "Payments"
direction LR

system api "API"
system db "DB"

api <-> db as L1 {
  style {
    stroke #abcdef
  }
  waypoint (10, 20)
}

flow "Checkout" as f1 {
  intro "start"
  api -> db : "query"
}

layout saved
position api (120, 240)
position db (420, 240)
`;

/** Paste text into the code view and wait for a clean sync. */
async function seedDoc(page: Page, text: string): Promise<void> {
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  // The shell renders before workspace hydration; do not select text until the
  // initial file has reached the editor, or that write can reset the selection.
  await expect(editor).toContainText('pcd 1.0');
  await editor.click();
  await editor.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });
}

/** Drag a rendered object by (dx, dy) in screen pixels. */
async function dragObject(page: Page, id: string, dx: number, dy: number): Promise<void> {
  const obj = page.getByTestId('canvas').locator(`g.pc-obj[data-id="${id}"]`);
  const b = (await obj.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await page.mouse.up();
}

test('P0/D1: a canvas drag keeps flow, view, positions and link semantics', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);

  await dragObject(page, 'api', 60, 40);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });

  const content = page.locator('.cm-content');
  // F-01: nothing outside objects/links may be lost by a canvas write
  await expect(content).toContainText('flow "Checkout"');
  await expect(content).toContainText('layout saved');
  await expect(content).toContainText('position api (120, 240)');
  await expect(content).toContainText('stroke #abcdef');
  await expect(content).toContainText('waypoint (10, 20)');
  await expect(content).toContainText('title "Payments"');
  // F-08: the bidirectional arrow is not rewritten as `-uses->`
  await expect(content).toContainText('api <-> db');
  await expect(content).not.toContainText('uses');

  // …and the same holds after a reload (IDB round-trip)
  await page.reload();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);
  await expect(content).toContainText('flow "Checkout"');
  await expect(content).toContainText('api <-> db');
});

test('P0/D2: adding objects to a loaded file never duplicates an id', async ({ page }) => {
  await page.goto('/');
  await seedDoc(page, DOC);
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };

  for (let i = 0; i < 3; i++) {
    const item = page.getByTestId('palette-container');
    const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 200 + i * 90, box.y + 420, { steps: 6 });
    await page.mouse.up();
  }
  await expect(canvas.locator('g.pc-obj')).toHaveCount(5);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', {
    timeout: 5000,
  });

  // the code view re-renders from the canvas on a 150 ms debounce — wait for it
  await expect(page.locator('.cm-content')).toContainText('container');
  const ids = await canvas.locator('g.pc-obj').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-id')),
  );
  expect(new Set(ids).size).toBe(5); // five render nodes, five distinct ids

  // `clean` stays set during the trailing 150 ms canvas → code debounce. Wait
  // for the final projection, not merely the first newly inserted container.
  await expect
    .poll(async () => {
      const content = await page.locator('.cm-content').innerText();
      return [...content.matchAll(/(?:system|container|datastore|component|person)\s+(\w+)/g)].map(
        (m) => m[1],
      );
    })
    .toEqual(['api', 'db', 'o1', 'o2', 'o3']);
});

test('P0/D5: a group survives a reload with its size (F-06)', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await openWorkspacePanels(page, ['code']);
  const item = page.getByTestId('palette-group');
  const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await page.mouse.down();
  await page.mouse.move(420, 360, { steps: 8 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1);
  await expect(page.locator('.cm-content')).toContainText('group');

  // F-06: the drawn boundary survives the reload (position persistence is
  // F-14 — asserted in its own spec).
  await page.reload();
  await expect(canvas.locator('g.pc-obj')).toHaveCount(1);
  await expect(canvas.locator('g.pc-obj.pc-kind-group')).toHaveCount(1);
  await expect(canvas.locator('g.pc-obj text')).toContainText('Group 1');
});

test('P0/D6: object and link "dashed" survive a reload (F-07)', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await seedDoc(page, 'pcd 1.0\n\nsystem api "API"\nsystem db "DB"\n\napi -> db as L1\n');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(2);

  // object dashed
  await canvas.locator('g.pc-obj[data-id="api"]').click();
  await page.getByTestId('prop-dashed').check();
  await expect(page.locator('.cm-content')).toContainText('dashed');

  // link dashed
  await canvas.locator('g.pc-link[data-id="L1"] path.pc-route').click({ force: true });
  await page.getByTestId('link-dashed').check();
  // quiescence: the link's style block must have reached the code view (the
  // machine renders from the canvas on a 150 ms debounce) — reloading earlier
  // would race the write, which is a test artefact, not a product state.
  await expect(page.locator('.cm-content')).toContainText('api -> db as L1 {');

  await page.reload();
  await expect(canvas.locator('g.pc-obj[data-id="api"]')).toHaveCount(1);
  await expect(canvas.locator('g.pc-link[data-id="L1"]')).toHaveClass(/pc-dashed/);
  await canvas.locator('g.pc-obj[data-id="api"]').click();
  await expect(page.getByTestId('prop-dashed')).toBeChecked();
  await expect(canvas.locator('g.pc-obj[data-id="api"]')).toHaveClass(/pc-dashed/);
});
