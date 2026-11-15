// SPDX-License-Identifier: GPL-3.0-only
// FLOW-02: connector sparks — count, speed multiplier, one-way completion and
// bidirectional ping-pong, deterministic staggering, clamping and cleanup.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FlowAnimator, type BeatCtx } from './engine';
import type { AnimHandle, AnimOpts, AnimPlayer, Keyframe } from './ports';
import { MOTION } from './timings';
import type { Beat, BeatLink } from '../flows/plan';

const SVG_NS = 'http://www.w3.org/2000/svg';

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
  length: () => 100,
  pointAt: (_path: Element, dist: number) => ({ x: dist, y: 0 }),
};

const ctx: BeatCtx = { rectOf: (id) => ({ x: id === 'b' ? 200 : 0, y: 0, w: 100, h: 60 }) };

const mkSvg = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
  const world = document.createElementNS(SVG_NS, 'g');
  world.setAttribute('class', 'pc-world');
  svg.appendChild(world);
  for (const id of ['a', 'b']) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'pc-obj');
    g.setAttribute('data-id', id);
    world.appendChild(g);
  }
  const link = document.createElementNS(SVG_NS, 'g');
  link.setAttribute('class', 'pc-link');
  link.setAttribute('data-id', 'ab');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'pc-route');
  path.setAttribute('d', 'M0 0 L100 0');
  link.appendChild(path);
  world.appendChild(link);
  return svg;
};

const linkOf = (extra: Partial<BeatLink> = {}): BeatLink => ({
  linkId: 'ab',
  from: 'a',
  to: 'b',
  flipped: false,
  bidir: false,
  ...extra,
});

const beatOf = (link: BeatLink): Beat => ({
  index: 1,
  kind: 'msg',
  title: 'a → b',
  actors: ['a', 'b'],
  links: [link],
  dim: [],
  delayMs: MOTION.stepDelayMs,
  camera: { mode: 'hold' },
  cameraIds: [],
});

const tokens = (svg: SVGSVGElement): Element[] => [...svg.querySelectorAll('.pc-token')];

const tokenCalls = (calls: Call[]): Call[] => calls.filter((c) => c.el.getAttribute('class') === 'pc-token');

/** x coordinate of a translate() keyframe (y is always 0 in this fixture). */
const xOf = (kf: Keyframe): number => Number(/translate\(([-\d.]+)px/.exec(String(kf.transform))?.[1] ?? NaN);

describe('FLOW-02 connector sparks', () => {
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

  it('keeps the historical single token at default speed', () => {
    play(linkOf());
    const calls = tokenCalls(fx.calls);
    expect(tokens(svg)).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.opts.durationMs).toBe(MOTION.tokenMs);
    expect(calls[0]!.opts.iterations ?? 1).toBe(1);
    // the token fades out at the far end for a one-way connector
    expect(calls[0]!.kf.at(-1)?.opacity).toBe(0);
  });

  it('draws `sparks` staggered tokens and scales duration by speed', () => {
    play(linkOf({ sparks: 3, speed: 2 }));
    const calls = tokenCalls(fx.calls);
    expect(tokens(svg)).toHaveLength(3);
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.opts.durationMs).toBe(MOTION.tokenMs / 2);
    const delays = calls.map((c) => c.opts.delayMs ?? 0);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(3);
  });

  it('clamps out-of-range counts and speeds instead of failing', () => {
    play(linkOf({ sparks: 99, speed: 0.01 }));
    const calls = tokenCalls(fx.calls);
    expect(tokens(svg)).toHaveLength(8);
    expect(calls[0]!.opts.durationMs).toBe(MOTION.tokenMs / 0.25);
  });

  it('ping-pongs along a bidirectional connector and starts at the far end when flipped', () => {
    play(linkOf({ bidir: true }));
    const call = tokenCalls(fx.calls)[0]!;
    expect(call.opts.iterations).toBe(Infinity);
    const xs = call.kf.map(xOf);
    expect(xs.at(-1)).toBeCloseTo(0); // ping-pong returns to the start point

    svg = mkSvg();
    fx = mkPlayer();
    play(linkOf({ bidir: true, flipped: true }));
    const flippedXs = tokenCalls(fx.calls)[0]!.kf.map(xOf);
    expect(flippedXs[0]).toBeCloseTo(100);
  });

  it('reduced motion draws no sparks at all', () => {
    play(linkOf({ sparks: 4, bidir: true }), true);
    expect(tokens(svg)).toHaveLength(0);
    expect(fx.calls.some((c) => c.el.getAttribute('class') === 'pc-token')).toBe(false);
  });

  it('clears every spark on the next beat and on stop', () => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry });
    anim.play(beatOf(linkOf({ sparks: 4, bidir: true })), ctx);
    expect(tokens(svg)).toHaveLength(4);
    anim.play({ ...beatOf(linkOf()), kind: 'process', links: [] }, ctx);
    expect(tokens(svg)).toHaveLength(0);
    anim.play(beatOf(linkOf({ sparks: 2 })), ctx);
    anim.stop();
    expect(tokens(svg)).toHaveLength(0);
    expect(svg.querySelector('.pc-anim-layer')?.textContent).toBe('');
  });
});
