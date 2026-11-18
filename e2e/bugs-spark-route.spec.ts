// SPDX-License-Identifier: GPL-3.0-only
// Bug: a spark travelled straight between the two connector endpoints, so on a
// bent or curved connector it left the drawn route mid-travel. This runs the
// real renderer and WAAPI in Chromium: present a step on a deliberately curved
// connector, freeze the layer at mid-travel, and compare the painted spark
// position against the points the connector path actually passes through.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

// The waypoint pushes the route far above the straight line between the two
// entities, so endpoint-to-endpoint interpolation is visibly off the route.
const DOC = `pcd 1.0

system client "Client"
system api "API"

client -calls-> api as L1 {
  style { route curved }
  waypoint (420, 40)
}

layout saved
position client (60, 320)
position api (660, 320)

flow "Route" as route {
  client -> api : "round trip" as L1
}
`;

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await seedCode(page, DOC);
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-route')).toBeVisible();
}

/**
 * Freeze the beat's animation layer as soon as the spark exists, then seek it
 * to one instant. A finished `fill: none` animation is dropped from
 * `getAnimations()`, so pausing before the first seek keeps it rewindable.
 */
async function freeze(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    const deadline = performance.now() + 5000;
    const step = (): void => {
      const spark = document.querySelector('.pc-anim-layer [data-role="spark"]');
      if (spark === null) {
        if (performance.now() > deadline) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
        return;
      }
      for (const el of document.querySelectorAll('.pc-anim-layer *')) {
        for (const animation of el.getAnimations()) animation.pause();
      }
      resolve();
    };
    step();
  }));
}

async function seek(page: Page, at: number): Promise<void> {
  await page.evaluate((time) => {
    for (const el of document.querySelectorAll('.pc-anim-layer *')) {
      for (const animation of el.getAnimations()) animation.currentTime = time;
    }
  }, at);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

interface RouteDistance {
  /** How far the painted spark sits from the nearest point of the drawn route. */
  offRoute: number;
  /** How far the straight chord between the endpoints runs from the route. */
  chordOffRoute: number;
  spark: { x: number; y: number } | null;
}

/** Compare the spark's painted centre with the connector path, in screen space
 *  (getScreenCTM applies the camera pan/zoom, the same space the user sees). */
async function measure(page: Page): Promise<RouteDistance> {
  return page.evaluate(() => {
    const spark = document.querySelector('.pc-anim-layer [data-role="spark"]');
    const route = document.querySelector('.pc-link[data-id="L1"] .pc-route') as SVGPathElement | null;
    if (spark === null || route === null) return { offRoute: NaN, chordOffRoute: NaN, spark: null };
    const box = spark.getBoundingClientRect();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const ctm = route.getScreenCTM();
    if (ctm === null) return { offRoute: NaN, chordOffRoute: NaN, spark: centre };
    const total = route.getTotalLength();
    const toScreen = (dist: number): { x: number; y: number } => {
      const p = route.getPointAtLength(dist);
      return { x: p.x * ctm.a + p.y * ctm.c + ctm.e, y: p.x * ctm.b + p.y * ctm.d + ctm.f };
    };
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.hypot(a.x - b.x, a.y - b.y);
    let offRoute = Infinity;
    const SAMPLES = 400;
    for (let i = 0; i <= SAMPLES; i++) {
      offRoute = Math.min(offRoute, distance(centre, toScreen((total * i) / SAMPLES)));
    }
    const start = toScreen(0);
    const end = toScreen(total);
    let chordOffRoute = 0;
    for (let i = 1; i < SAMPLES; i++) {
      const frac = i / SAMPLES;
      const onChord = { x: start.x + (end.x - start.x) * frac, y: start.y + (end.y - start.y) * frac };
      chordOffRoute = Math.max(chordOffRoute, distance(onChord, toScreen(total * frac)));
    }
    return { offRoute, chordOffRoute, spark: centre };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`a spark follows the drawn connector route (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, theme);

    await page.getByTestId('step-play-0').click();
    await freeze(page);
    await expect(page.locator('.pc-anim-layer [data-role="spark"]')).toHaveCount(1);
    // Let the camera glide land, then park the transport so the framing is the
    // visible one and nothing keeps animating the layer.
    await page.waitForTimeout(1_200);
    await page.getByTestId('pb-toggle').click();
    await expect(page.getByTestId('playbar')).toHaveAttribute('data-status', 'paused');

    // The route must actually bend, otherwise this test proves nothing.
    const atStart = await measure(page);
    expect(atStart.chordOffRoute, 'the connector route is visibly curved').toBeGreaterThan(20);

    for (const frac of [0.25, 0.5, 0.75]) {
      // The spark is visible from the source pulse peak to the arrival, so the
      // travel leg covers these instants.
      await seek(page, 300 + frac * 1_100);
      const shot = await measure(page);
      expect(shot.spark, `spark painted at ${frac}`).not.toBeNull();
      expect(shot.offRoute, `spark stays on the route at ${String(frac)} of travel`)
        .toBeLessThan(4);
      await capture(page, `spark-route-${String(frac).replace('.', '-')}-${theme}`, { golden: false });
    }

    await page.getByTestId('pb-exit').click();
    await expect(page.locator('.pc-anim-layer [data-role="spark"]')).toHaveCount(0);
  });
}
