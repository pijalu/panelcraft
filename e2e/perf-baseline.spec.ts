// SPDX-License-Identifier: GPL-3.0-only
// N1 perf baseline (M2-WP10): 300-object scene — in-browser pan/zoom/drag frame
// sampling. Asserts sanity floors (target N1: 60 fps ≤300 objects); measured
// numbers are recorded in docs/milestones/M2.md. 300 objects are quick-added
// stacked at the view center — DOM cost is position-independent.
import { expect, test } from '@playwright/test';

async function startFrameCount(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number; __rafOn: boolean };
    w.__frames = 0;
    w.__rafOn = true;
    const tick = (): void => {
      if (!w.__rafOn) return;
      w.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrameCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number; __rafOn: boolean };
    w.__rafOn = false;
    return w.__frames;
  });
}

test('N1: pan/zoom/drag frame baseline with 300 objects', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox()) ?? { x: 0, y: 0, width: 800, height: 600 };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // 300 systems via quick-add (key 1) — controller places at view center
  for (let i = 0; i < 300; i++) await page.keyboard.press('1');
  await expect(canvas.locator('g.pc-obj')).toHaveCount(300);

  // ---- pan (middle-button drag, world transform swap per frame) -------------
  await startFrameCount(page);
  const panT0 = Date.now();
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx - 300, cy - 200, { steps: 60 });
  await page.mouse.up({ button: 'middle' });
  const panMs = Date.now() - panT0;
  const panFrames = await stopFrameCount(page);
  const panFps = panFrames / (panMs / 1000);

  // ---- zoom (ctrl+wheel, 24 steps anchor-stable) ----------------------------
  await startFrameCount(page);
  const zoomT0 = Date.now();
  await page.keyboard.down('Control');
  for (let i = 0; i < 24; i++) await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  const zoomMs = Date.now() - zoomT0;
  const zoomFrames = await stopFrameCount(page);
  const zoomFps = zoomFrames / (zoomMs / 1000);

  // ---- single-object drag (guides vs 299 others + patch per frame) ----------
  await startFrameCount(page);
  const dragT0 = Date.now();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 240, cy + 160, { steps: 60 });
  await page.mouse.up();
  const dragMs = Date.now() - dragT0;
  const dragFrames = await stopFrameCount(page);
  const dragFps = dragFrames / (dragMs / 1000);

  console.log(
    `perf(e2e) 300 objects: pan ${panFrames}f/${panMs}ms=${panFps.toFixed(0)}fps · ` +
      `zoom ${zoomFrames}f/${zoomMs}ms=${zoomFps.toFixed(0)}fps · ` +
      `drag ${dragFrames}f/${dragMs}ms=${dragFps.toFixed(0)}fps`,
  );
  // sanity floors (CI variance margin below the 60 fps N1 target)
  expect(panFps).toBeGreaterThanOrEqual(30);
  expect(zoomFps).toBeGreaterThanOrEqual(30);
  expect(dragFps).toBeGreaterThanOrEqual(30);
});
