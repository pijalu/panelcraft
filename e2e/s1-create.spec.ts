// SPDX-License-Identifier: GPL-3.0-only
// S1 Create (SPEC §3.1, M2 canvas scope, M2-WP10): drag person/system/container
// from the palette onto the canvas → link them → set properties → diagram
// renders live. Also captures light/dark screenshots (vision round 1 input).
import { expect, test } from '@playwright/test';
import { capture } from './lib/screenshots';

test('S1: create diagram via palette drop + link + properties', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await expect(canvas).toBeVisible();

  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  // drop targets relative to the live canvas box (the code pane shares the
  // row since M4, so absolute x offsets would leave the canvas)
  const fx = (f: number): number => box.x + Math.round((box.width ?? 0) * f);
  const fy = (f: number): number => box.y + Math.round((box.height ?? 0) * f);
  // drop targets: three shapes — left / mid / lower-mid inside the canvas
  const drops = [
    { kind: 'palette-person', x: fx(0.2), y: fy(0.22) },
    { kind: 'palette-system', x: fx(0.62), y: fy(0.22) },
    { kind: 'palette-container', x: fx(0.62), y: fy(0.62) },
  ];
  for (const d of drops) {
    const item = page.getByTestId(d.kind);
    const ib = (await item.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
    await page.mouse.down();
    await page.mouse.move(d.x, d.y, { steps: 8 });
    await page.mouse.up();
  }
  const objs = canvas.locator('g.pc-obj');
  await expect(objs).toHaveCount(3);

  // ---- link person → system via right-edge halo -----------------------------
  // select the person first (click its body), then drag from the halo
  await page.mouse.click(drops[0]!.x, drops[0]!.y);
  const halo = canvas.locator('.pc-halo[data-side="right"]').first();
  await expect(halo).toBeVisible();
  const hb = (await halo.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  // drag to system's left edge midpoint (object w = 160 → half width)
  await page.mouse.move(drops[1]!.x - 80, drops[1]!.y, { steps: 6 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-link')).toHaveCount(1);
  await expect(canvas.locator('g.pc-link path.pc-route')).not.toHaveAttribute('d', '');

  // ---- link system → container ----------------------------------------------
  await page.mouse.click(drops[1]!.x, drops[1]!.y);
  const halo2 = canvas.locator('.pc-halo[data-side="bottom"]').first();
  await expect(halo2).toBeVisible();
  const hb2 = (await halo2.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(drops[2]!.x, drops[2]!.y - 30, { steps: 6 });
  await page.mouse.up();
  await expect(canvas.locator('g.pc-link')).toHaveCount(2);

  // ---- properties: rename system, live svg label update ---------------------
  await page.mouse.click(drops[1]!.x, drops[1]!.y);
  const name = page.getByTestId('prop-name');
  await expect(name).toHaveValue(/System/);
  await name.fill('Payment API');
  await name.blur();
  await expect(canvas.locator('g.pc-obj text', { hasText: 'Payment API' })).toBeVisible();

  const tech = page.getByTestId('prop-technology');
  await tech.fill('Go, gRPC');
  await tech.blur();

  // light + dark screenshots (vision round 1 input, committed baselines)
  await expect(canvas.locator('g.pc-obj')).toHaveCount(3);
  await capture(page, 'm2-s1-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, 'm2-s1-dark');
});
