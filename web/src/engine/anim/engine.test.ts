// SPDX-License-Identifier: GPL-3.0-only
// M5-WP2 unit tests — FlowAnimator (dim sets, token travel, rings, badges,
// reduced-motion end states). All ports faked: player records animations,
// geometry serves a straight line — deterministic, no real timers/WAAPI.
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { FlowAnimator, type BeatCtx } from './engine';
import type { AnimHandle, AnimPlayer } from './ports';
import { MOTION } from './timings';
import type { Beat } from '../flows/plan';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface PlayerCall {
  el: Element;
  kf: Record<string, string | number>[];
  durationMs: number;
  easing: string;
}

const mkPlayer = (): { player: AnimPlayer; calls: PlayerCall[] } => {
  const calls: PlayerCall[] = [];
  return {
    calls,
    player: {
      animate: (el, kf, opts): AnimHandle => {
        calls.push({ el, kf: [...kf], durationMs: opts.durationMs, easing: opts.easing ?? 'linear' });
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

  it('switching beats restores the previous dim set', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 1, kind: 'process', actors: ['a'], dim: ['b', 'c', 'ab', 'bc'] }), ctx);
    anim.play(beatOf({ index: 2, kind: 'process', actors: ['c'], dim: ['a', 'b', 'ab', 'bc'] }), ctx);
    expect(svg.querySelector('.pc-obj[data-id="a"]')?.classList.contains('pc-dim')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="c"]')?.classList.contains('pc-dim')).toBe(false);
  });

  it('stop() restores everything and empties the anim layer', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(beatOf({ index: 1, kind: 'msg', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }], dim: ['c', 'bc'] }), ctx);
    anim.stop();
    expect(svg.querySelectorAll('.pc-dim').length).toBe(0);
    expect(svg.querySelector('.pc-anim-layer')?.childElementCount).toBe(0);
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
    expect(tokenCall?.durationMs).toBe(MOTION.tokenMs);
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

  it('par beats animate all lane links concurrently under one dim pass', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: mkGeometry() });
    anim.play(
      beatOf({
        index: 5,
        kind: 'par',
        actors: ['a', 'b'],
        dim: ['c', 'bc'],
        lanes: [
          [{ index: 5, kind: 'msg', title: '', actors: ['a', 'b'], links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }], dim: [], delayMs: 0 }],
          [{ index: 5, kind: 'process', title: '', actors: ['b'], links: [], dim: [], delayMs: 0 }],
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
    // only the badge is in the anim layer — no token/trail/ring motion
    const layer = svg.querySelector('.pc-anim-layer');
    expect(layer?.childElementCount).toBe(1);
    expect(layer?.querySelector('.pc-badge')).not.toBeNull();
    expect(svg.querySelector('.pc-obj[data-id="c"]')?.classList.contains('pc-dim')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="a"]')?.classList.contains('pc-emph')).toBe(true);
    expect(svg.querySelector('.pc-obj[data-id="b"]')?.classList.contains('pc-emph')).toBe(true);
  });
});
