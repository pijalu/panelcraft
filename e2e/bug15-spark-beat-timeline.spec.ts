// SPDX-License-Identifier: GPL-3.0-only
// Bug: spark and border effects need one beat timeline. Real Chromium WAAPI
// evidence: sample the source pulse, mid-travel, arrival and settled frame of
// one/multiple/reverse/bidirectional sparks in both themes, plus reduced motion.
import { expect, test, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';
import { beatTimeline } from '../web/src/engine/anim/timeline';
import { MOTION } from '../web/src/engine/anim/timings';

const DOC = `pcd 1.0

person ada "Ada"
system shop "Shop"
system bank "Bank"
system ledger "Ledger"

ada -single-> shop as L1
shop -many-> bank as L2 {
  style {
    sparks 3
    speed 2
  }
}
bank -rev-> ledger as L3
shop <-> ledger as L4

layout saved
position ada (60, 120)
position shop (320, 120)
position bank (580, 120)
position ledger (840, 120)

flow "Beats" as beats {
  intro "Start"
  ada -> shop : "one" as L1
  shop -> bank : "many" as L2
  bank -> ledger : "reverse" as L3 flip
  shop -> ledger : "both" as L4
  par "lane pair" {
    { ada -> shop : "lane one" as L1 }
    { shop -> bank : "lane two" as L2 }
  }
  conclusion "Done"
}
`;

interface Scenario {
  name: string;
  step: number;
  count: number;
  speed: number;
  bidir?: boolean;
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'one', step: 1, count: 1, speed: 1 },
  { name: 'multiple', step: 2, count: 3, speed: 2 },
  { name: 'reverse', step: 3, count: 1, speed: 1 },
  { name: 'bidirectional', step: 4, count: 1, speed: 1, bidir: true },
];

async function seed(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await openWorkspacePanels(page, ['code', 'flows']);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean');
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').press('ControlOrMeta+a');
  await page.keyboard.insertText(DOC);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-sync-state', 'clean', { timeout: 10_000 });
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-beats')).toBeVisible();
}

/** Freeze the beat transport, then seek every layer animation to one instant. */
async function seek(page: Page, at: number): Promise<void> {
  await page.evaluate((time) => {
    const layer = document.querySelector('.pc-anim-layer');
    if (layer === null) return;
    for (const el of layer.querySelectorAll('*')) {
      for (const animation of el.getAnimations()) {
        animation.pause();
        animation.currentTime = time;
      }
    }
  }, at);
  // One frame for WAAPI to commit the sampled style before a capture.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

interface LiveState {
  count: number;
  state: string;
  time: number;
}

/**
 * Freeze the beat's animation layer the moment its first spark exists.
 *
 * A finished `fill: none` animation no longer affects its element, so Chromium
 * drops it from `Element.getAnimations()`: a later seek to an earlier instant
 * silently skips it and the ring stays at the invisible base opacity the CSS
 * gives rings before their animation reveals them. Parking the transport after
 * a fixed wait raced exactly that boundary. Freezing the layer inside the task
 * that first sees the spark keeps every pulse seekable, and the transport is
 * still parked separately by the caller.
 */
async function freezeLayer(page: Page): Promise<LiveState> {
  return page.evaluate(() => new Promise<LiveState>((resolve) => {
    const deadline = performance.now() + 5000;
    const step = (): void => {
      const spark = document.querySelector('.pc-anim-layer [data-role="spark"]');
      if (spark === null) {
        if (performance.now() > deadline) {
          resolve({ count: 0, state: 'missing', time: -1 });
          return;
        }
        requestAnimationFrame(step);
        return;
      }
      // Real Chromium WAAPI, not a fake player: read the live state first, then
      // freeze the layer so every later seek can rewind every phase.
      const animation = spark.getAnimations()[0];
      const live: LiveState = {
        count: spark.getAnimations().length,
        state: animation?.playState ?? 'none',
        time: Number(animation?.currentTime ?? -1),
      };
      const layer = document.querySelector('.pc-anim-layer');
      if (layer !== null) {
        for (const el of layer.querySelectorAll('*')) {
          for (const a of el.getAnimations()) a.pause();
        }
      }
      resolve(live);
    };
    step();
  }));
}

/** Drop the finished camera glide so the transform its own clock timer applied
 *  is the one on screen; a paused mid-glide animation would otherwise keep
 *  framing the endpoints half-way. */
async function cancelCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (!(target instanceof Element) || target.closest('.pc-anim-layer') !== null) continue;
      animation.cancel();
    }
  });
}

interface Sample {
  source: number | null;
  target: number | null;
  spark: number | null;
  arrived: number | null;
  sparkX: number | null;
}

async function sample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const read = (role: string): Element | null =>
      document.querySelector(`.pc-anim-layer [data-role="${role}"]`);
    const opacity = (el: Element | null): number | null =>
      el === null ? null : Number(getComputedStyle(el).opacity);
    const spark = read('spark');
    const matrix = spark === null ? null : getComputedStyle(spark).transform;
    const x = matrix === null || matrix === 'none'
      ? null
      : Number(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)/.exec(matrix)?.[1] ?? NaN);
    return {
      source: opacity(read('source-pulse')),
      target: opacity(read('target-pulse')),
      spark: opacity(spark),
      arrived: opacity(read('arrival-token')),
      sparkX: x,
    };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`one beat timeline: WAAPI filmstrip (${theme})`, async ({ page }) => {
    test.setTimeout(240_000);
    await seed(page, theme);

    for (const scenario of SCENARIOS) {
      const t = beatTimeline({
        dwellMs: MOTION.stepDelayMs,
        count: scenario.count,
        speed: scenario.speed,
        bidir: scenario.bidir,
      });
      const pass = t.sparks[0]!.passes[0]!;
      const finalPass = t.sparks[0]!.passes.at(-1)!;
      const shots = {
        source: pass.source.peak,
        travel: pass.travel.start + (pass.travel.arrival - pass.travel.start) / 2,
        firstArrival: pass.target.peak,
        arrival: finalPass.target.peak,
        settled: t.finalRestMs + Math.max(1, t.settleMs),
      };

      await page.getByTestId(`step-play-${scenario.step}`).click();
      // Freeze the layer as soon as the spark exists, then read the WAAPI state
      // it had while running: parking the transport after a fixed wait raced the
      // source pulse's own end and made the filmstrip flaky under load.
      const live = await freezeLayer(page);
      expect(live.count).toBeGreaterThan(0);
      expect(live.state).toBe('running');
      expect(live.time).toBeGreaterThanOrEqual(0);

      // The camera glide lands through its own clock timer, so let it land (the
      // layer is already frozen), park the transport, then drop the glide so the
      // applied framing is the visible one.
      await page.waitForTimeout(MOTION.cameraMs + 80);
      await page.getByTestId('pb-toggle').click();
      await expect(page.getByTestId('playbar')).toHaveAttribute('data-status', 'paused');
      await cancelCamera(page);

      await seek(page, shots.source);
      const atSource = await sample(page);
      expect(atSource.source, `${scenario.name} source border`).toBeGreaterThan(0.5);
      expect(atSource.target, `${scenario.name} target still at rest`).toBe(0);
      expect(atSource.arrived, `${scenario.name} no settled token yet`).toBe(0);
      await capture(page, `bug15-${scenario.name}-source-${theme}`, { golden: false });

      await seek(page, shots.travel);
      const atTravel = await sample(page);
      expect(atTravel.spark, `${scenario.name} spark visible mid-travel`).toBeGreaterThan(0.5);
      expect(atTravel.target, `${scenario.name} target still at rest mid-travel`).toBe(0);
      await capture(page, `bug15-${scenario.name}-travel-${theme}`, { golden: false });

      await seek(page, shots.firstArrival);
      const atFirstArrival = await sample(page);
      expect(atFirstArrival.target, `${scenario.name} target border pulses on arrival`).toBeGreaterThan(0.5);
      expect(atFirstArrival.spark, `${scenario.name} spark gone on arrival`).toBe(0);
      if (scenario.bidir === true) {
        // The first leg's arrival is a border pulse; the settled token appears
        // at the last arrival, after the spark has come back.
        expect(atFirstArrival.arrived, 'no token until the final bidir arrival').toBe(0);
        await capture(page, `bug15-${scenario.name}-first-arrival-${theme}`, { golden: false });
        await seek(page, shots.arrival);
      } else {
        expect(atFirstArrival.arrived, `${scenario.name} settled token on arrival`).toBeGreaterThan(0.5);
      }
      const atArrival = await sample(page);
      expect(atArrival.arrived, `${scenario.name} settled token on final arrival`).toBeGreaterThan(0.5);
      await capture(page, `bug15-${scenario.name}-arrival-${theme}`, { golden: false });

      await seek(page, shots.settled);
      const atSettled = await sample(page);
      expect(atSettled.source, `${scenario.name} source at rest`).toBe(0);
      expect(atSettled.target, `${scenario.name} target at rest`).toBe(0);
      expect(atSettled.spark, `${scenario.name} no moving spark when settled`).toBe(0);
      expect(atSettled.arrived, `${scenario.name} arrived token remains`).toBe(1);
      // Computed opacity alone is not enough: an SVG transform written with px
      // units is ignored by Chromium and parks the token off-canvas.
      const tokenBox = await page.locator('[data-role="arrival-token"]').first().boundingBox();
      const canvasBox = await page.getByTestId('canvas').boundingBox();
      expect(tokenBox, `${scenario.name} token is painted`).not.toBeNull();
      expect(tokenBox!.x, `${scenario.name} token ${JSON.stringify(tokenBox)} canvas ${JSON.stringify(canvasBox)}`).toBeGreaterThan(canvasBox!.x);
      expect(tokenBox!.y, `${scenario.name} token inside canvas`).toBeGreaterThan(canvasBox!.y);
      expect(tokenBox!.x + tokenBox!.width, `${scenario.name} token inside canvas`)
        .toBeLessThan(canvasBox!.x + canvasBox!.width);
      await capture(page, `bug15-${scenario.name}-settled-${theme}`, { golden: false });

      // Travel direction follows the resolved endpoints, not the actor ring.
      console.log('BEAT_FILMSTRIP', JSON.stringify({
        theme,
        scenario: scenario.name,
        times: shots,
        live,
        source: atSource,
        travel: atTravel,
        firstArrival: atFirstArrival,
        settled: atSettled,
      }));
      const direction = scenario.name === 'reverse' ? -1 : 1;
      expect((atTravel.sparkX! - atSource.sparkX!) * direction, `${scenario.name} leaves source`).toBeGreaterThan(2);
      expect((atFirstArrival.sparkX! - atTravel.sparkX!) * direction, `${scenario.name} reaches target`).toBeGreaterThan(2);

      await page.getByTestId('pb-exit').click();
      await expect(page.locator('.pc-anim-layer [data-role="spark"]')).toHaveCount(0);
    }

    // Parallel lanes run their own spark timelines under one beat.
    await page.getByTestId('step-play-5').click();
    await expect(page.getByTestId('playbar')).toBeVisible();
    // Freeze first for the same reason as the scenarios above: a finished pulse
    // cannot be rewound by seek(), and this capture shows the settled frame.
    await freezeLayer(page);
    await page.waitForTimeout(MOTION.cameraMs + 80);
    await page.getByTestId('pb-toggle').click();
    await cancelCamera(page);
    // Lane one has one spark; lane two uses the three-spark connector.
    await expect(page.locator('.pc-anim-layer [data-role="source-pulse"]')).toHaveCount(4);
    await seek(page, MOTION.stepDelayMs);
    await capture(page, `bug15-parallel-settled-${theme}`, { golden: false });
    await page.getByTestId('pb-exit').click();

    // Reduced motion: only the final visible state, no WAAPI work at all.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('step-play-1').click();
    await expect(page.locator('.pc-anim-layer .pc-token-static')).toHaveCount(1);
    const animations = await page.evaluate(() =>
      [...document.querySelectorAll('.pc-anim-layer *')].flatMap((el) => el.getAnimations()).length,
    );
    expect(animations, 'reduced motion must not animate').toBe(0);
    expect(await page.locator('.pc-anim-layer [data-role="source-pulse"]').count()).toBe(0);
    const stillBox = await page.locator('.pc-anim-layer .pc-token-static').boundingBox();
    const canvasBox = await page.getByTestId('canvas').boundingBox();
    expect(stillBox, 'reduced-motion token is painted').not.toBeNull();
    expect(stillBox!.x).toBeGreaterThan(canvasBox!.x);
    expect(stillBox!.y).toBeGreaterThan(canvasBox!.y);
    await capture(page, `bug15-reduced-motion-${theme}`, { golden: false });
    await page.getByTestId('pb-exit').click();
  });
}
