// SPDX-License-Identifier: GPL-3.0-only
// Item 9 (transport): every presentation control must respond to pointer and
// keyboard input in the playing, paused and branch-choice states. The report was
// "buttons do not respond", so this scenario records the clicked control, its hit
// target, the player state and any console error before asserting behaviour.
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { capture } from './lib/screenshots';
import { openFlowSteps, openWorkspacePanels } from './lib/panels';
import { seedCode } from './lib/seed';

const DOC = `pcd 1.0

direction LR

person ada "Ada"
system shop "Shop"
system bank "Bank"

ada -> shop : "browses"
shop -requests-> bank : "charge" as L1

flow "Checkout" as main {
  intro "Kick off"
  ada -> shop : "pay"
  alt "method" {
    "card"    { shop -> bank : "charge card" }
    "cash"    { info "cash is not in this story" }
  }
  process shop "Pack"
  conclusion "done"
}
`;

async function seed(page: Page, doc: string = DOC): Promise<void> {
  await page.goto('/');
  await openWorkspacePanels(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('pcd 1.0');
  await seedCode(page, doc);
  await openFlowSteps(page);
  await expect(page.getByTestId('flow-row-main')).toBeVisible({ timeout: 5000 });
}

/** What the pointer actually hits at the centre of a control, and its state. */
async function probe(page: Page, testId: string): Promise<{
  hit: string;
  status: string;
  index: number;
  disabled: boolean;
}> {
  const box = (await page.getByTestId(testId).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x as number, y as number);
      return el === null ? 'nothing' : `${el.tagName.toLowerCase()}${el instanceof SVGElement ? ' svg' : ''}.${el.className || '-'}${el.hasAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}`;
    },
    [box.x + box.width / 2, box.y + box.height / 2] as const,
  );
  const dock = page.getByTestId('present-dock');
  return {
    hit,
    status: (await dock.getAttribute('data-status')) ?? '',
    index: Number(await page.getByTestId('present-counter').textContent().then((t) => (t ?? '0').split(' ')[0])),
    disabled: await page.getByTestId(testId).isDisabled(),
  };
}

/** The step counter as numbers. */
async function counter(page: Page): Promise<{ index: number; total: number }> {
  const text = (await page.getByTestId('present-counter').textContent()) ?? '0 / 0';
  const parts = text.split('/').map((part) => Number(part.trim()));
  return { index: parts[0] ?? 0, total: parts[1] ?? 0 };
}

test.describe('presentation transport (item 9)', () => {
  test('every control responds to pointer input while playing', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await seed(page);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    await expect(page.getByTestId('present-dock')).toBeVisible();
    // Pause first so the step index is stable while we poke the controls.
    await page.getByTestId('present-toggle').click();
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused');

    // Probe what the pointer hits at each control's centre before clicking it.
    const probes = {
      back: await probe(page, 'present-back'),
      toggle: await probe(page, 'present-toggle'),
      next: await probe(page, 'present-next'),
      restart: await probe(page, 'present-restart'),
      exit: await probe(page, 'present-exit'),
      dot2: await probe(page, 'present-dot-2'),
    };
    for (const [name, p] of Object.entries(probes)) {
      // The hit target must be the control itself (or a child of it), never the
      // canvas-wide advance layer sitting behind the dock.
      expect(p.hit, `${name} hit target: ${p.hit}`).not.toContain('present-advance');
      expect(p.disabled, `${name} must be enabled`).toBe(false);
    }

    // next advances one beat
    const first = await counter(page);
    await page.getByTestId('present-next').click();
    await expect(page.getByTestId('present-counter')).toHaveText(`${first.index + 1} / ${first.total}`);
    // back returns
    await page.getByTestId('present-back').click();
    await expect(page.getByTestId('present-counter')).toHaveText(`${first.index} / ${first.total}`);
    // a progress dot jumps to its step
    const target = Math.min(4, first.total);
    await page.getByTestId(`present-dot-${target}`).click();
    await expect(page.getByTestId('present-counter')).toHaveText(`${target} / ${first.total}`);
    // restart returns to the first beat
    await page.getByTestId('present-restart').click();
    await expect(page.getByTestId('present-counter')).toHaveText(`1 / ${first.total}`);
    await capture(page, 'item9-transport-paused');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('play/pause toggles and the advance surface advances', async ({ page }) => {
    await seed(page);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    const dock = page.getByTestId('present-dock');
    await expect(dock).toHaveAttribute('data-status', 'playing');
    await page.getByTestId('present-toggle').click();
    await expect(dock).toHaveAttribute('data-status', 'paused');
    await page.getByTestId('present-toggle').click();
    await expect(dock).toHaveAttribute('data-status', 'playing');
    await page.getByTestId('present-toggle').click();
    const before = await page.getByTestId('present-counter').textContent();
    // The canvas-wide advance layer still advances while paused.
    await page.getByTestId('present-advance').click({ position: { x: 200, y: 120 } });
    await expect(page.getByTestId('present-counter')).not.toHaveText(before ?? '');
  });

  test('branch choices are reachable and pick a branch', async ({ page }) => {
    await seed(page);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    // Walk to the alt step (step 3) manually so no timing is involved.
    await page.getByTestId('present-dot-3').click();
    const choices = page.getByTestId('present-choices');
    await expect(choices).toBeVisible();
    const buttons = choices.getByRole('button');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.first()).toBeEnabled();
    await capture(page, 'item9-branch-choices');
    await buttons.first().click();
    await expect(choices).toBeHidden();
  });

  test('shortcuts keep working from anywhere in the presentation', async ({ page }) => {
    await seed(page);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    await page.getByTestId('present-toggle').click();
    const dock = page.getByTestId('present-dock');
    await expect(dock).toHaveAttribute('data-status', 'paused');
    const start = await counter(page);

    // Nothing focused: Space is the advance shortcut.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(page.getByTestId('present-counter')).toHaveText(`${start.index + 1} / ${start.total}`);

    // Focus on a control: the arrow keys still drive the transport.
    await page.getByTestId('present-back').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('present-counter')).toHaveText(`${start.index} / ${start.total}`);
    // ...and Escape still exits from a focused control.
    await page.getByTestId('present-next').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
  });

  test('every control is keyboard reachable and operable', async ({ page }) => {
    await seed(page);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    await page.getByTestId('present-toggle').click();
    const dock = page.getByTestId('present-dock');
    await expect(dock).toHaveAttribute('data-status', 'paused');
    // Tab order enters the dock; Enter/Space must activate the focused control.
    const start = await counter(page);
    await page.getByTestId('present-next').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('present-counter')).toHaveText(`${start.index + 1} / ${start.total}`);
    await page.getByTestId('present-back').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('present-counter')).toHaveText(`${start.index} / ${start.total}`);
    await page.getByTestId('present-toggle').focus();
    await page.keyboard.press('Space');
    await expect(dock).toHaveAttribute('data-status', 'playing');
    await page.getByTestId('present-exit').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-presenting', 'false');
  });
});

// Two participants a short hop apart, a wider diagram around them and an
// explicit layout so the framing is deterministic.
const NEAR_DOC = `pcd 1.0

direction LR

person ada "Ada"
system shop "Shop"
system bank "Bank"

ada -> shop : "browses"
shop -requests-> bank : "charge" as L1

layout saved
position ada (120, 140)
position shop (360, 140)
position bank (700, 140)

flow "Checkout" as main {
  intro "Kick off"
  ada -> shop : "pay"
  conclusion "done"
}
`;

// A flow whose first beat is already a message, so the transport can be paused
// mid-flight without waiting for an auto-advance.
const MSG_FIRST_DOC = `pcd 1.0

direction LR

person ada "Ada"
system shop "Shop"

ada -> shop : "browses"

flow "Checkout" as main {
  ada -> shop : "pay"
  conclusion "done"
}
`;

const canvas = (page: Page) => page.getByTestId('canvas');
const worldScale = async (page: Page): Promise<number> => {
  const t = (await canvas(page).locator('.pc-world').getAttribute('transform')) ?? 'scale(1)';
  const m = /scale\(([-\d.]+)\)/.exec(t);
  return Number(m?.[1] ?? 1);
};
/** Presentation zoom ceiling from web/src/engine/anim/camera.ts. */
const PRESENT_ZOOM_MAX = 1.25;

/** Bounding box of a scene object in page coordinates. */
async function objectBox(page: Page, id: string): Promise<{ x: number; y: number; width: number; height: number }> {
  return (await canvas(page).locator(`g.pc-obj[data-id="${id}"]`).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
}

/** Whether a box lies inside another. */
function inside(inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }, slack = 1): boolean {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

test.describe('presentation framing (item 9)', () => {
  test('caps the automatic zoom and keeps the diagram around the participants', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seed(page, NEAR_DOC);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    const dock = page.getByTestId('present-dock');
    await expect(dock).toBeVisible();
    // Walk to the message beat and let the camera glide settle.
    await page.getByTestId('present-dot-2').click();
    await expect.poll(async () => worldScale(page), { timeout: 5000 }).toBeLessThanOrEqual(PRESENT_ZOOM_MAX + 0.001);
    await page.waitForTimeout(500);
    const scale = await worldScale(page);
    expect(scale).toBeLessThanOrEqual(PRESENT_ZOOM_MAX + 0.001);
    expect(scale).toBeGreaterThan(0.2);

    // Both participants stay fully on screen…
    const view = (await canvas(page).boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
    const ada = await objectBox(page, 'ada');
    const shop = await objectBox(page, 'shop');
    for (const [name, box] of [['ada', ada], ['shop', shop]] as const) {
      expect(box.width, `${name} is rendered`).toBeGreaterThan(0);
      expect(inside(box, view), `${name} stays inside the canvas: ${JSON.stringify(box)} in ${JSON.stringify(view)}`).toBe(true);
    }
    // …with the diagram around them: the visible world is far wider than the
    // two-shape union, which is the difference between a step and a crop.
    const unionW = shop.x + shop.width - ada.x;
    expect(view.width / scale).toBeGreaterThan(unionW * 2);
    await capture(page, 'item9-framing-light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await capture(page, 'item9-framing-dark');
  });

  test('the token reaches the endpoint and holds there', async ({ page }) => {
    await seed(page);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    await page.getByTestId('present-dot-2').click();
    const token = canvas(page).locator('[data-role="arrival-token"]').first();
    await expect(token).toHaveCount(1, { timeout: 5000 });
    // The beat-lifetime contract: travel ends inside the dwell, so the arrival
    // is marked by a settled token instead of a spark vanishing at 900 ms.
    await expect
      .poll(
        async () =>
          token.evaluate((el) => {
            const anims = (el as Element).getAnimations();
            return anims.length === 0 ? 'none' : anims[0]?.playState ?? 'none';
          }),
        { timeout: 5000 },
      )
      .toBe('finished');
    const arrived = await token.evaluate((el) => {
      const anim = (el as Element).getAnimations()[0];
      return String(anim?.currentTime ?? -1);
    });
    // It stays put until the step changes (no snap back to the path start, no
    // orphaned second token).
    await page.waitForTimeout(250);
    const still = await token.evaluate((el) => {
      const anim = (el as Element).getAnimations()[0];
      return String(anim?.currentTime ?? -1);
    });
    expect(still).toBe(arrived);
    await expect(canvas(page).locator('[data-role="arrival-token"]')).toHaveCount(1);
    await expect(canvas(page).locator('[data-role="spark"]')).toHaveCount(1);
    await capture(page, 'item9-token-arrived-light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await capture(page, 'item9-token-arrived-dark');
  });

});

// Replay is a transport contract, kept in its own suite so each describe stays
// reviewable. Same seed and canvas helpers as the framing cases above.
test.describe('presentation replay (item 9)', () => {
  test('pausing freezes the beat, stepping and exiting leave no orphans', async ({ page }) => {
    await seed(page, MSG_FIRST_DOC);
    await page.getByTestId('flow-play-main').click();
    await page.getByTestId('pb-present').click();
    const token = canvas(page).locator('[data-role="spark"]').first();
    await expect(token).toHaveCount(1, { timeout: 5000 });
    const travelTime = (): Promise<number> =>
      token.evaluate((el) => Number((el as Element).getAnimations()[0]?.currentTime ?? -1));
    // Let it move, then pause: the beat freezes mid-flight.
    await page.waitForTimeout(300);
    await page.getByTestId('present-toggle').click();
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused');
    // The dock state is synchronous; WAAPI commits pause on the next frame.
    // Sampling before that gives a false "still moving" reading.
    await expect
      .poll(async () =>
        token.evaluate((el) => {
          const anim = (el as Element).getAnimations()[0];
          return anim === undefined ? 'none' : anim.playState;
        }),
      )
      .toBe('paused');
    const frozen = await travelTime();
    await page.waitForTimeout(250);
    // A pause request takes effect on a frame boundary, so one more frame (16.7 ms
    // at 60 Hz) can commit after `playState` already reads 'paused'. A tolerance
    // below that quantum cannot tell "frozen" from "advanced one frame" and fails
    // on a loaded machine for no product reason; a beat that kept travelling moves
    // a large fraction of its travel time in 250 ms, far beyond a single frame.
    expect(Math.abs((await travelTime()) - frozen)).toBeLessThan(20);
    // Replay: a fresh spark on the current beat, starting from time zero.
    const oldToken = await token.elementHandle();
    await page.getByTestId('present-toggle').click();
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'playing');
    // The old WAAPI animation is cancelled with its detached element; the new
    // one belongs to the same beat, not to a resumed mid-flight token.
    expect(await oldToken?.evaluate((el) => el.isConnected)).toBe(false);
    await expect
      .poll(async () =>
        token.evaluate((el) => {
          const anim = (el as Element).getAnimations()[0];
          return anim === undefined ? 'none' : anim.playState;
        }),
      )
      .toBe('running');
    const replayed = await token.evaluate((el) => {
      const anim = (el as Element).getAnimations()[0];
      return { currentTime: Number(anim?.currentTime ?? -1), state: anim?.playState };
    });
    console.log('REPLAY_WAAPI', JSON.stringify({ frozen, replayed }));
    expect(replayed.state).toBe('running');
    expect(replayed.currentTime).toBeGreaterThanOrEqual(0);
    expect(replayed.currentTime).toBeLessThan(frozen);
    // The visible spark moves again along the same connector, and the step is
    // not advanced twice by the fresh full-duration dwell timer. The source
    // pulse precedes travel, so poll the token's own transform instead of
    // letting a concurrent camera glide masquerade as spark movement.
    const atStart = await token.boundingBox();
    const localStart = await token.evaluate((el) => getComputedStyle(el).transform);
    await expect.poll(() => token.evaluate((el) => getComputedStyle(el).transform)).not.toBe(localStart);
    // Transform and bounding-box reads cross different rendering frames. Poll
    // the visible displacement itself instead of sampling once after any change.
    await expect.poll(async () => {
      const later = await token.boundingBox();
      return Math.abs((later?.x ?? 0) - (atStart?.x ?? 0));
    }).toBeGreaterThan(2);
    await expect(page.getByTestId('present-counter')).toContainText('1 / 2');

    // A parked step really is parked: the dot jump settles the token at the
    // endpoint, so "paused" never coexists with a travelling spark.
    await page.getByTestId('present-restart').click();
    await page.getByTestId('present-dot-1').click();
    await expect(page.getByTestId('present-dock')).toHaveAttribute('data-status', 'paused');
    const arrived = canvas(page).locator('[data-role="arrival-token"]').first();
    await expect
      .poll(async () =>
        arrived.evaluate((el) => {
          const anim = (el as Element).getAnimations()[0];
          return anim === undefined ? 'gone' : anim.playState;
        }),
      )
      .toBe('finished');
    const moving = canvas(page).locator('[data-role="spark"]').first();
    await expect(moving).toHaveCSS('opacity', '0');

    // Exiting removes every animation layer, token and trail.
    await page.getByTestId('present-exit').click();
    await expect(canvas(page).locator('.pc-token')).toHaveCount(0);
    await expect(canvas(page).locator('.pc-trail')).toHaveCount(0);
    await expect(canvas(page).locator('.pc-anim-layer')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`token core and glow stay bounded (${theme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await seed(page);
      await page.getByTestId('flow-play-main').click();
      await page.getByTestId('pb-present').click();
      await page.getByTestId('present-dot-2').click();
      const token = canvas(page).locator('.pc-token').first();
      await expect(token).toHaveCount(1, { timeout: 5000 });
      const look = await token.evaluate((el) => {
        const cs = getComputedStyle(el as Element);
        return { fill: cs.fill, filter: cs.filter };
      });
      // Neon = a saturated core plus a halo, never a bloom: every blur radius
      // stays within 8 px so a spark can pass a label without washing it out.
      expect(look.filter).toContain('drop-shadow');
      const radii = [...look.filter.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      expect(radii.length).toBeGreaterThan(0);
      for (const radius of radii) expect(radius).toBeLessThanOrEqual(8);
      // The core is a theme token, not the chrome accent: light and dark differ.
      const accent = await canvas(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--pc-accent').trim());
      const core = await canvas(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--pc-spark-core').trim());
      expect(core).not.toBe('');
      expect(core).not.toBe(accent);
      await capture(page, `item9-neon-token-${theme}`);
    });
  }
});
