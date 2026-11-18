// SPDX-License-Identifier: GPL-3.0-only
// FLOW-02: connector sparks — persisted count/speed, deterministic staggering,
// clamping and cleanup, now expressed on the shared beat timeline.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FlowAnimator, MAX_SPARK_SAMPLES, sparkRoute, type BeatCtx, type PathGeometry } from './engine';
import type { AnimHandle, AnimOpts, AnimPlayer, Keyframe } from './ports';
import { beatTimeline, clampCount, clampSpeed } from './timeline';
import { MOTION } from './timings';
import type { Beat, BeatLink } from '../flows/plan';

const NS = 'http://www.w3.org/2000/svg';

interface Call {
  el: Element;
  kf: Keyframe[];
  opts: AnimOpts;
}

const mkPlayer = (): { player: AnimPlayer; calls: Call[] } => {
  const calls: Call[] = [];
  return {
    calls,
    player: {
      animate: (el, kf, opts): AnimHandle => {
        calls.push({ el, kf: [...kf], opts });
        return { cancel: () => {} };
      },
    },
  };
};

const geometry = {
  length: () => 400,
  pointAt: (_path: Element, dist: number) => ({ x: dist, y: 0 }),
};

const ctx: BeatCtx = { rectOf: (id) => ({ x: id === 'b' ? 200 : 0, y: 0, w: 100, h: 60 }) };

const mkSvg = (): SVGSVGElement => {
  const svg = document.createElementNS(NS, 'svg') as unknown as SVGSVGElement;
  const world = document.createElementNS(NS, 'g');
  world.setAttribute('class', 'pc-world');
  svg.appendChild(world);
  for (const id of ['a', 'b']) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('data-id', id);
    world.appendChild(g);
  }
  const link = document.createElementNS(NS, 'g');
  link.setAttribute('class', 'pc-link');
  link.setAttribute('data-id', 'ab');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('class', 'pc-route');
  path.setAttribute('d', 'M0 0 L400 0');
  link.appendChild(path);
  world.appendChild(link);
  return svg;
};

const linkOf = (extra: Partial<BeatLink> = {}): BeatLink => ({
  linkId: 'ab', from: 'a', to: 'b', flipped: false, bidir: false, ...extra,
});

const beatOf = (link: BeatLink): Beat => ({
  index: 1,
  kind: 'msg',
  title: 'a -> b',
  actors: ['a', 'b'],
  links: [link],
  dim: [],
  delayMs: MOTION.stepDelayMs,
  camera: { mode: 'hold' },
  cameraIds: [],
});

const moving = (svg: SVGSVGElement): Element[] => [...svg.querySelectorAll('[data-role="spark"]')];
const roleCalls = (calls: Call[], role: string): Call[] =>
  calls.filter((c) => c.el.getAttribute('data-role') === role);

describe('FLOW-02 connector sparks on one beat timeline', () => {
  let svg: SVGSVGElement;
  let fx: { player: AnimPlayer; calls: Call[] };

  beforeEach(() => {
    svg = mkSvg();
    fx = mkPlayer();
  });

  const play = (link: BeatLink, reducedMotion = false): void => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry, reducedMotion });
    anim.play(beatOf(link), ctx);
  };

  it('keeps one moving spark and one settled token inside the beat', () => {
    play(linkOf());
    const t = beatTimeline({ dwellMs: MOTION.stepDelayMs, count: 1, speed: 1 });
    expect(moving(svg)).toHaveLength(1);
    expect(roleCalls(fx.calls, 'spark')).toHaveLength(1);
    expect(roleCalls(fx.calls, 'arrival-token')).toHaveLength(1);
    expect(roleCalls(fx.calls, 'source-pulse')).toHaveLength(1);
    expect(roleCalls(fx.calls, 'target-pulse')).toHaveLength(1);
    expect(t.finalRestMs + t.settleMs).toBeLessThanOrEqual(MOTION.stepDelayMs);
  });

  it('draws `sparks` staggered tokens that all finish inside the beat', () => {
    play(linkOf({ sparks: 3, speed: 2 }));
    const t = beatTimeline({ dwellMs: MOTION.stepDelayMs, count: 3, speed: 2 });
    expect(moving(svg)).toHaveLength(3);
    expect(roleCalls(fx.calls, 'spark')).toHaveLength(3);
    const starts = roleCalls(fx.calls, 'spark').map((c) => c.opts.delayMs ?? 0);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(3);
    expect(t.finalRestMs + t.settleMs).toBeLessThanOrEqual(MOTION.stepDelayMs);
  });

  it('clamps out-of-range counts and speeds instead of failing', () => {
    expect(clampCount(99)).toBe(8);
    expect(clampSpeed(0.01)).toBe(0.25);
    play(linkOf({ sparks: 99, speed: 0.01 }));
    expect(moving(svg)).toHaveLength(8);
    const t = beatTimeline({ dwellMs: MOTION.stepDelayMs, count: 8, speed: 0.25 });
    expect(t.finalRestMs + t.settleMs).toBeLessThanOrEqual(MOTION.stepDelayMs);
  });

  it('ping-pongs along a bidirectional connector and starts at the far end when flipped', () => {
    play(linkOf({ bidir: true }));
    const call = roleCalls(fx.calls, 'spark')[0]!;
    const xs = call.kf.map((kf) => Number(/translate\(([-\d.]+)px/.exec(String(kf.transform))?.[1] ?? NaN));
    expect(xs.at(-1)).toBeCloseTo(0); // return leg ends back at the source
    expect(Math.max(...xs)).toBeCloseTo(400);

    svg = mkSvg();
    fx = mkPlayer();
    play(linkOf({ bidir: true, flipped: true, from: 'b', to: 'a' }));
    const flipped = roleCalls(fx.calls, 'spark')[0]!;
    const flippedXs = flipped.kf.map((kf) => Number(/translate\(([-\d.]+)px/.exec(String(kf.transform))?.[1] ?? NaN));
    expect(flippedXs[0]).toBeCloseTo(400);
  });

  it('reduced motion animates nothing and shows only the settled state', () => {
    play(linkOf({ sparks: 4, bidir: true }), true);
    expect(fx.calls).toHaveLength(0);
    const staticTokens = [...svg.querySelectorAll('.pc-token-static')];
    expect(staticTokens).toHaveLength(1);
    expect(staticTokens[0]!.getAttribute('transform')).toContain('translate(0, 0)');
    expect(svg.querySelector('.pc-link')?.classList.contains('pc-emph')).toBe(true);
  });

  it('clears every spark on the next beat and on stop', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry });
    anim.play(beatOf(linkOf({ sparks: 4, bidir: true })), ctx);
    expect(moving(svg)).toHaveLength(4);
    anim.play({ ...beatOf(linkOf()), kind: 'process', links: [] }, ctx);
    expect(moving(svg)).toHaveLength(0);
    anim.play(beatOf(linkOf({ sparks: 2 })), ctx);
    anim.stop();
    expect(moving(svg)).toHaveLength(0);
    expect(svg.querySelector('.pc-anim-layer')).toBeNull();
  });
});

describe('spark follows the drawn connector', () => {
  // A curved route: a spark interpolating only between the endpoints would cut
  // the corner and leave the drawn line at mid-travel.
  const ARC_LEN = 400;
  const arcGeometry: PathGeometry = {
    length: () => ARC_LEN,
    pointAt: (_path: Element, dist: number) => ({
      x: dist,
      y: -Math.sin((Math.PI * dist) / ARC_LEN) * 100,
    }),
  };

  const play = (link: BeatLink): Call[] => {
    const svg = mkSvg();
    const fx = mkPlayer();
    const anim = new FlowAnimator(svg, { player: fx.player, geometry: arcGeometry });
    anim.play(beatOf(link), ctx);
    return roleCalls(fx.calls, 'spark');
  };

  // The keyframe transform carries raw numbers, which can print in exponent
  // form for values a hair off zero — parse the field, do not pattern-match it.
  const positions = (call: Call): { x: number; y: number }[] =>
    call.kf.map((kf) => {
      const m = /translate\((\S+?)px, (\S+?)px\)/.exec(String(kf.transform));
      return { x: Number(m?.[1] ?? NaN), y: Number(m?.[2] ?? NaN) };
    });

  const bulgeAt = (x: number): number => -Math.sin((Math.PI * x) / ARC_LEN) * 100;

  it('emits keyframes sampled along the route, not only at the endpoints', () => {
    const [call] = play(linkOf());
    expect(call).toBeDefined();
    const points = positions(call!);
    // Every position sits on the drawn route, including the ones between ends.
    for (const p of points) expect(p.y).toBeCloseTo(bulgeAt(p.x), 3);
    // A curve whose midpoint is 100 units off the straight line needs samples.
    expect(points.filter((p) => Math.abs(p.y) > 1).length).toBeGreaterThan(1);
  });

  it('travels in path order forward and in reverse for a flipped step', () => {
    const forward = positions(play(linkOf())[0]!).map((p) => p.x);
    const reversed = positions(play(linkOf({ flipped: true, from: 'b', to: 'a' }))[0]!).map((p) => p.x);
    expect(forward[0]).toBeCloseTo(0);
    expect(forward.at(-1)).toBeCloseTo(ARC_LEN);
    expect(reversed[0]).toBeCloseTo(ARC_LEN);
    expect(reversed.at(-1)).toBeCloseTo(0);
    const ascending = forward.filter((x, i) => i > 0 && x > forward[i - 1]! - 0.001).length;
    expect(ascending).toBeGreaterThan(forward.length / 2);
    const descending = reversed.filter((x, i) => i > 0 && x < reversed[i - 1]! + 0.001).length;
    expect(descending).toBeGreaterThan(reversed.length / 2);
  });

  it('caps the sample count so a long route cannot flood the keyframe list', () => {
    expect(sparkRoute(0, 100_000).length).toBeLessThanOrEqual(MAX_SPARK_SAMPLES + 1);
    // A degenerate (zero-length) leg still yields its two endpoints.
    expect(sparkRoute(20, 20)).toEqual([20, 20]);
  });
});
