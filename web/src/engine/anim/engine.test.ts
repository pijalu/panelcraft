// SPDX-License-Identifier: GPL-3.0-only
// M5-WP2 unit tests — FlowAnimator (dim sets, token travel, rings, badges,
// reduced-motion end states). All ports faked: player records animations,
// geometry serves a straight line — deterministic, no real timers/WAAPI.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { FlowAnimator, type BeatCtx } from './engine';
import type { AnimHandle, AnimPlayer } from './ports';
import { MOTION, travelTiming } from './timings';
import type { Beat } from '../flows/plan';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface PlayerCall {
  el: Element;
  kf: Record<string, string | number>[];
  durationMs: number;
  easing: string;
  fill: string;
}

const mkPlayer = (): { player: AnimPlayer; calls: PlayerCall[] } => {
  const calls: PlayerCall[] = [];
  return {
    calls,
    player: {
      animate: (el, kf, opts): AnimHandle => {
        calls.push({
          el,
          kf: [...kf],
          durationMs: opts.durationMs,
          easing: opts.easing ?? 'linear',
          fill: opts.fill ?? 'none',
        });
        return { cancel: () => {} };
      },
    },
  };
};

const mkGeometry = () => ({
  length: () => 100,
  pointAt: (_path: Element, dist: number) => ({ x: dist, y: 0 }),
});

const RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 0, y: 0, w: 120, h: 80 },
  b: { x: 200, y: 0, w: 120, h: 80 },
  c: { x: 400, y: 0, w: 120, h: 80 },
};

/** Scene: three objects, two routed links (ab horizontal, bc horizontal). */
const mkSvg = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
  const world = document.createElementNS(SVG_NS, 'g');
  world.setAttribute('class', 'pc-world');
  svg.appendChild(world);
  for (const id of ['a', 'b', 'c']) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'pc-obj');
    g.setAttribute('data-id', id);
    world.appendChild(g);
  }
  for (const id of ['ab', 'bc']) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'pc-link');
    g.setAttribute('data-id', id);
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('class', 'pc-route');
    p.setAttribute('d', 'M0 0 L100 0');
    g.appendChild(p);
    world.appendChild(g);
  }
  return svg;
};

const beatOf = (partial: Partial<Beat> & Pick<Beat, 'index' | 'kind'>): Beat => ({
  title: '',
  actors: [],
  links: [],
  dim: [],
  delayMs: MOTION.stepDelayMs,
  camera: { mode: 'hold' },
  cameraIds: [],
  ...partial,
});

const ctx: BeatCtx = {
  rectOf: (id) => RECTS[id] ?? null,
};

describe('FlowAnimator dims (FR-F4)', () => {
  let svg: SVGSVGElement;
  let fx: { player: AnimPlayer; calls: PlayerCall[] };

  beforeEach(() => {
    svg = mkSvg();
    fx = mkPlayer();
  });

  it('dims every non-participating object and link', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 1, kind: 'msg', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }], dim: ['c', 'bc'] }), ctx);
    expect(svg.querySelector('.pc-obj[data-id="c"]')?.classList.contains('pc-dim')).toBe(true);
    expect(svg.querySelector('.pc-link[data-id="bc"]')?.classList.contains('pc-dim')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="a"]')?.classList.contains('pc-dim')).toBe(false);
    expect(svg.querySelector('.pc-link[data-id="ab"]')?.classList.contains('pc-dim')).toBe(false);
  });

  it('switching beats clears stale dim classes before applying history', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 1, kind: 'process', actors: ['a'], dim: ['b', 'c', 'ab', 'bc'] }), ctx);
    anim.play(beatOf({ index: 2, kind: 'process', actors: ['c'], dim: ['a', 'b', 'ab', 'bc'] }), ctx);
    expect(svg.querySelector('.pc-obj[data-id="a"]')?.classList.contains('pc-dim-history')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="a"]')?.classList.contains('pc-dim')).toBe(false);
    expect(svg.querySelector('.pc-obj[data-id="b"]')?.classList.contains('pc-dim')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="c"]')?.classList.contains('pc-dim')).toBe(false);
  });

  it('keeps the previous beat legible with a softer history fade', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({
      index: 1,
      kind: 'msg',
      actors: ['a', 'b'],
      links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }],
      dim: ['c', 'bc'],
    }), ctx);
    anim.play(beatOf({ index: 2, kind: 'process', actors: ['b'], dim: ['a', 'c', 'ab', 'bc'] }), ctx);

    const previousObject = svg.querySelector('.pc-obj[data-id="a"]');
    const previousLink = svg.querySelector('.pc-link[data-id="ab"]');
    expect(previousObject?.classList.contains('pc-dim-history')).toBe(true);
    expect(previousObject?.classList.contains('pc-dim')).toBe(false);
    expect(previousLink?.classList.contains('pc-dim-history')).toBe(true);
    expect(previousLink?.classList.contains('pc-dim')).toBe(false);
    expect(svg.querySelector('.pc-obj[data-id="c"]')?.classList.contains('pc-dim')).toBe(true);

    // Only the immediately previous beat gets the softer treatment.
    anim.play(beatOf({ index: 3, kind: 'process', actors: ['c'], dim: ['a', 'b', 'ab', 'bc'] }), ctx);
    expect(previousObject?.classList.contains('pc-dim-history')).toBe(false);
    expect(previousObject?.classList.contains('pc-dim')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="b"]')?.classList.contains('pc-dim-history')).toBe(true);
    anim.stop();
    expect(svg.querySelectorAll('.pc-dim-history')).toHaveLength(0);
  });

  it('stop() restores everything and removes the anim layer', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 1, kind: 'msg', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }], dim: ['c', 'bc'] }), ctx);
    anim.stop();
    expect(svg.querySelectorAll('.pc-dim').length).toBe(0);
    // No orphan layer survives playback (item 9).
    expect(svg.querySelector('.pc-anim-layer')).toBeNull();
  });

  it('settle() jumps the beat to its end state instead of leaving it moving', () => {
    // A parked step reports "paused", so nothing may still be travelling.
    let finished = 0;
    const anim = new FlowAnimator(svg, {
      player: { ...fx.player, finishAll: () => (finished += 1) },
      geometry: mkGeometry(),
    });
    anim.play(beatOf({ index: 1, kind: 'msg', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }], dim: [] }), ctx);
    anim.settle();
    expect(finished).toBe(1);
  });

  it('pause()/resume() delegate to the player', () => {
    let paused = 0;
    let resumed = 0;
    const anim = new FlowAnimator(svg, {
      player: { ...fx.player, pauseAll: () => (paused += 1), resumeAll: () => (resumed += 1) },
      geometry: mkGeometry(),
    });
    anim.pause();
    anim.resume();
    expect(paused).toBe(1);
    expect(resumed).toBe(1);
  });

  it('replay cancels only the old beat animations, never camera work', () => {
    let seq = 0;
    const cancelled: number[] = [];
    let globalCancels = 0;
    const player: AnimPlayer = {
      animate: (): AnimHandle => {
        seq += 1;
        const id = seq;
        return { cancel: () => cancelled.push(id) };
      },
      cancelAll: () => {
        globalCancels += 1;
      },
    };
    const anim = new FlowAnimator(svg, { player, geometry: mkGeometry() });
    // The camera uses the same AnimPlayer port but is not owned by a beat.
    const cameraWork = player.animate(svg, [], { durationMs: 100 });
    anim.play(beatOf({
      index: 1,
      kind: 'msg',
      actors: ['a'],
      links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }],
      dim: [],
    }), ctx);
    expect(cancelled).toEqual([]);

    anim.play(beatOf({ index: 2, kind: 'process', actors: ['b'], dim: [] }), ctx);
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled).not.toContain(1); // camera glide untouched
    anim.stop();
    expect(cancelled).not.toContain(1);
    expect(globalCancels).toBe(0);
    cameraWork.cancel();
    expect(cancelled).toContain(1);
  });

  it('beats without participants touch nothing (intro overview)', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 1, kind: 'intro', title: 'hello' }), ctx);
    expect(svg.querySelectorAll('.pc-dim').length).toBe(0);
    expect(fx.calls.length).toBe(0);
  });
});

describe('FlowAnimator tokens, rings, badges (FR-F4)', () => {
  let svg: SVGSVGElement;
  let fx: { player: AnimPlayer; calls: PlayerCall[] };

  beforeEach(() => {
    svg = mkSvg();
    fx = mkPlayer();
  });

  it('msg beat animates a token + trailing dash along the link path', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 2, kind: 'msg', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }] }), ctx);
    const layer = svg.querySelector('.pc-anim-layer');
    expect(layer?.querySelector('.pc-token')).not.toBeNull();
    expect(layer?.querySelector('.pc-trail')).not.toBeNull();
    const tokenCall = fx.calls.find((c) => c.el.classList.contains('pc-token'));
    expect(tokenCall).toBeDefined();
    // The beat owns the timing (item 9): the token arrives before the step
    // changes and holds there instead of vanishing after its own 900 ms.
    expect(tokenCall?.durationMs).toBe(travelTiming(MOTION.stepDelayMs, 1, 1).durationMs);
    expect(tokenCall?.fill).toBe('forwards');
    expect(tokenCall?.kf.length).toBeGreaterThan(1); // sampled travel keyframes
    expect(tokenCall?.kf[0]?.transform).toContain('translate(0');
  });

  it('flip reverses the token travel', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 2, kind: 'msg', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'b', to: 'a', flipped: true }] }), ctx);
    const tokenCall = fx.calls.find((c) => c.el.classList.contains('pc-token'));
    const first = tokenCall?.kf[0]?.transform ?? '';
    const last = tokenCall?.kf.at(-1)?.transform ?? '';
    expect(first).toContain('translate(100'); // starts at the step-to end
    expect(last).toContain('translate(0');
  });

  it('actors get an emphasis ring pulsing via the player', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 3, kind: 'process', actors: ['c'] }), ctx);
    const ring = svg.querySelector('.pc-ring');
    expect(ring).not.toBeNull();
    const ringCall = fx.calls.find((c) => c.el.classList.contains('pc-ring'));
    expect(ringCall?.durationMs).toBe(MOTION.ringMs);
  });

  it('every beat carries a step-number badge', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 4, kind: 'process', actors: ['c'] }), ctx);
    expect(svg.querySelector('.pc-badge text')?.textContent).toBe('4');
  });

  it('centres the step number on the badge circle for 1, 10 and 100', () => {
    // .pc-badge-num is styled with text-anchor: middle and
    // dominant-baseline: central, so its x/y attributes are the rendered
    // glyph box's horizontal and vertical centre. They must coincide with
    // the dot's centre for every digit count — an extra offset pushes the
    // number low inside the circle.
    for (const index of [1, 10, 100]) {
      const s = mkSvg();
      const anim = new FlowAnimator(s, { player: mkPlayer().player, geometry: mkGeometry() });
      anim.play(beatOf({ index, kind: 'process', actors: ['c'] }), ctx);
      const circle = s.querySelector('.pc-badge-dot')!;
      const text = s.querySelector('.pc-badge-num')!;
      const cx = Number(circle.getAttribute('cx'));
      const cy = Number(circle.getAttribute('cy'));
      expect(Number(text.getAttribute('x'))).toBe(cx);
      expect(Number(text.getAttribute('y'))).toBe(cy);
    }
  });

  it('par beats animate all lane links concurrently under one dim pass', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(
      beatOf({
        index: 5,
        kind: 'par',
        actors: ['a', 'b'],
        dim: ['c', 'bc'],
        lanes: [
          [{ index: 5, kind: 'msg', title: '', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }], dim: [], delayMs: 0, camera: { mode: 'hold' }, cameraIds: [] }],
          [{ index: 5, kind: 'process', title: '', actors: ['b'], links: [], dim: [], delayMs: 0, camera: { mode: 'hold' }, cameraIds: [] }],
        ],
      }), ctx);
    const tokenCalls = fx.calls.filter((c) => c.el.classList.contains('pc-token'));
    expect(tokenCalls.length).toBe(1);
    expect(svg.querySelectorAll('.pc-dim').length).toBe(2);
  });
});

describe('FlowAnimator reduced motion (FR-F5)', () => {
  let svg: SVGSVGElement;
  let fx: { player: AnimPlayer; calls: PlayerCall[] };

  beforeEach(() => {
    svg = mkSvg();
    fx = mkPlayer();
  });

  it('no animations at all; end states applied instantly (badge still shows)', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry(), reducedMotion: true });
    anim.play(beatOf({ index: 2, kind: 'msg', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }], dim: ['c', 'bc'] }), ctx);
    expect(fx.calls.length).toBe(0);
    // The badge plus a static arrived token are in the layer — no motion at all,
    // but the beat still shows where the message went (item 9).
    const layer = svg.querySelector('.pc-anim-layer');
    expect(layer?.querySelector('.pc-badge')).not.toBeNull();
    expect(layer?.querySelectorAll('.pc-token-static')).toHaveLength(1);
    expect(layer?.querySelector('.pc-token:not(.pc-token-static)')).toBeNull();
    expect(layer?.querySelector('.pc-trail')).toBeNull();
    expect(svg.querySelector('.pc-obj[data-id="c"]')?.classList.contains('pc-dim')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="a"]')?.classList.contains('pc-emph')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="b"]')?.classList.contains('pc-emph')).toBe(true);
  });

  it('replaying a beat under reduced motion keeps only the settled state', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry(), reducedMotion: true });
    const beat = beatOf({
      index: 2,
      kind: 'msg',
      actors: ['a', 'b'],
      links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }],
      dim: [],
    });
    anim.play(beat, ctx);
    anim.play(beat, ctx); // the runner's replay path calls play again on the same beat
    expect(fx.calls.length).toBe(0);
    const layer = svg.querySelector('.pc-anim-layer');
    expect(layer?.querySelectorAll('.pc-token-static')).toHaveLength(1);
    expect(layer?.querySelector('.pc-ring')).toBeNull();
    expect(layer?.querySelectorAll('.pc-badge')).toHaveLength(1);
  });
});
