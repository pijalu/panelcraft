// SPDX-License-Identifier: GPL-3.0-only
// One-beat spark timeline: event order, computed visibility and ownership.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FlowAnimator, type BeatCtx } from './engine';
import type { AnimHandle, AnimOpts, AnimPlayer, Keyframe } from './ports';
import { beatTimeline } from './timeline';
import { MOTION } from './timings';
import type { Beat, BeatLink } from '../flows/plan';

const NS = 'http://www.w3.org/2000/svg';

interface Call {
  el: Element;
  kf: Keyframe[];
  opts: AnimOpts;
  cancelled: boolean;
}

const mkPlayer = (): { player: AnimPlayer; calls: Call[] } => {
  const calls: Call[] = [];
  return {
    calls,
    player: {
      animate: (el, kf, opts): AnimHandle => {
        const call: Call = { el, kf: [...kf], opts, cancelled: false };
        calls.push(call);
        return { cancel: () => { call.cancelled = true; } };
      },
    },
  };
};

const geometry = {
  length: () => 100,
  pointAt: (_path: Element, dist: number) => ({ x: dist, y: 0 }),
};

const ctx: BeatCtx = {
  rectOf: (id) => ({ x: id === 'b' ? 200 : 0, y: 0, w: 100, h: 60 }),
};

const mkSvg = (): SVGSVGElement => {
  const svg = document.createElementNS(NS, 'svg') as unknown as SVGSVGElement;
  const world = document.createElementNS(NS, 'g');
  world.setAttribute('class', 'pc-world');
  svg.appendChild(world);
  for (const id of ['a', 'b', 'c']) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('data-id', id);
    world.appendChild(g);
  }
  for (const id of ['ab', 'bc']) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'pc-link');
    g.setAttribute('data-id', id);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', 'pc-route');
    p.setAttribute('d', 'M0 0 L100 0');
    g.appendChild(p);
    world.appendChild(g);
  }
  return svg;
};

const linkOf = (extra: Partial<BeatLink> = {}): BeatLink => ({
  linkId: 'ab', from: 'a', to: 'b', flipped: false, ...extra,
});

const beatOf = (links: BeatLink[], delayMs: number = MOTION.stepDelayMs): Beat => ({
  index: 1,
  kind: 'msg',
  title: 'a -> b',
  actors: ['a', 'b'],
  links,
  dim: [],
  delayMs,
  camera: { mode: 'hold' },
  cameraIds: [],
});

const ofRole = (calls: Call[], role: string): Call[] =>
  calls.filter((c) => c.el.getAttribute('data-role') === role);

const actorOf = (call: Call): string | null => call.el.getAttribute('data-actor-id');

const xOf = (kf: Keyframe): number =>
  Number(/translate\(([-\d.]+)px/.exec(String(kf.transform))?.[1] ?? NaN);

describe('one-beat spark sequence', () => {
  let svg: SVGSVGElement;
  let fx: { player: AnimPlayer; calls: Call[] };

  beforeEach(() => {
    svg = mkSvg();
    fx = mkPlayer();
  });

  const play = (links: BeatLink[], delayMs: number = MOTION.stepDelayMs, reduced = false): void => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry, reducedMotion: reduced });
    anim.play(beatOf(links, delayMs), ctx);
  };

  it('orders source pulse, creation at peak, travel, arrival and target pulse', () => {
    play([linkOf()]);
    const t = beatTimeline({ dwellMs: MOTION.stepDelayMs, count: 1, speed: 1 });
    const pass = t.sparks[0]!.passes[0]!;
    const source = ofRole(fx.calls, 'source-pulse')[0]!;
    const spark = ofRole(fx.calls, 'spark')[0]!;
    const target = ofRole(fx.calls, 'target-pulse')[0]!;
    const arrived = ofRole(fx.calls, 'arrival-token')[0]!;

    expect(source.opts.delayMs).toBe(pass.source.start);
    const visible = spark.kf.find((kf) => kf.opacity === 1)!;
    const createdAt = (spark.opts.delayMs ?? 0) + Number(visible.offset) * spark.opts.durationMs;
    expect(createdAt).toBeCloseTo(pass.source.peak);
    expect(target.opts.delayMs).toBe(pass.travel.arrival);
    expect(arrived.opts.delayMs).toBe(pass.travel.arrival);
    expect(source.opts.durationMs).toBe(t.ringMs);
    expect(spark.opts.durationMs).toBeCloseTo(pass.target.end - pass.source.start);
    // Visibility is part of the contract: border invisible at rest, spark born
    // at the peak and gone at arrival, settled token visible from arrival on.
    expect(source.kf[0]?.opacity).toBe(0);
    expect(source.kf.at(-1)?.opacity).toBe(0);
    expect(spark.kf[0]?.opacity).toBe(0);
    expect(spark.kf.at(-1)?.opacity).toBe(0);
    expect(arrived.kf.at(-1)?.opacity).toBe(1);
    expect(xOf(spark.kf[0]!)).toBeCloseTo(0);
    expect(xOf(spark.kf.at(-1)!)).toBeCloseTo(100);
    expect(actorOf(source)).toBe('a');
    expect(actorOf(target)).toBe('b');
  });

  it('repeats creation and reception for every staggered spark', () => {
    play([linkOf({ sparks: 3 })]);
    const t = beatTimeline({ dwellMs: MOTION.stepDelayMs, count: 3, speed: 1 });
    expect(ofRole(fx.calls, 'source-pulse')).toHaveLength(3);
    expect(ofRole(fx.calls, 'spark')).toHaveLength(3);
    expect(ofRole(fx.calls, 'target-pulse')).toHaveLength(3);
    expect(ofRole(fx.calls, 'arrival-token')).toHaveLength(3);
    for (const [i, spark] of t.sparks.entries()) {
      expect(ofRole(fx.calls, 'spark')[i]!.opts.delayMs).toBe(spark.start);
      expect(ofRole(fx.calls, 'source-pulse')[i]!.opts.delayMs).toBe(spark.start);
    }
    expect(t.staggerMs).toBeGreaterThan(0);
  });

});

describe('one-beat spark sequence - endpoints and lifecycle', () => {
  let svg: SVGSVGElement;
  let fx: { player: AnimPlayer; calls: Call[] };

  beforeEach(() => {
    svg = mkSvg();
    fx = mkPlayer();
  });

  const play = (links: BeatLink[], delayMs: number = MOTION.stepDelayMs, reduced = false): void => {
    const anim = new FlowAnimator(svg, { player: fx.player, geometry, reducedMotion: reduced });
    anim.play(beatOf(links, delayMs), ctx);
  };

  it('pulses the resolved endpoints of a flipped link', () => {
    play([linkOf({ from: 'b', to: 'a', flipped: true })]);
    const source = ofRole(fx.calls, 'source-pulse')[0]!;
    const target = ofRole(fx.calls, 'target-pulse')[0]!;
    const spark = ofRole(fx.calls, 'spark')[0]!;
    expect(actorOf(source)).toBe('b');
    expect(actorOf(target)).toBe('a');
    expect(xOf(spark.kf[0]!)).toBeCloseTo(100);
    expect(xOf(spark.kf.at(-1)!)).toBeCloseTo(0);
  });

  it('pulses every bidirectional arrival, alternating the endpoints', () => {
    play([linkOf({ bidir: true })]);
    const t = beatTimeline({ dwellMs: MOTION.stepDelayMs, count: 1, speed: 1, bidir: true });
    const passes = t.sparks[0]!.passes;
    const sources = ofRole(fx.calls, 'source-pulse');
    const targets = ofRole(fx.calls, 'target-pulse');
    expect(sources).toHaveLength(passes.length);
    expect(targets).toHaveLength(passes.length);
    expect(sources.map(actorOf)).toEqual(passes.map((p) => p.source.actor === 'from' ? 'a' : 'b'));
    expect(targets.map(actorOf)).toEqual(passes.map((p) => p.travel.to === 'to' ? 'b' : 'a'));
    const spark = ofRole(fx.calls, 'spark')[0]!;
    // Two passes in one token animation: the far endpoint is a mid-course
    // turning point, not the final frame.
    expect(xOf(spark.kf.at(-1)!)).toBeCloseTo(0);
    expect(spark.kf.some((kf) => xOf(kf) === 100)).toBe(true);
    expect(fx.calls.filter((c) => c.el.classList.contains('pc-trail'))).toHaveLength(0);
  });

  it('runs parallel lanes through the same timeline under one beat', () => {
    const lane: Beat = {
      ...beatOf([linkOf({ linkId: 'bc', from: 'b', to: 'c' })]),
      index: 1,
      dim: [],
    };
    const par: Beat = { ...beatOf([linkOf()]), kind: 'par', lanes: [[lane]] };
    const anim = new FlowAnimator(svg, { player: fx.player, geometry });
    anim.play(par, ctx);
    expect(ofRole(fx.calls, 'source-pulse')).toHaveLength(2);
    expect(svg.querySelectorAll('.pc-badge')).toHaveLength(1);
    expect(svg.querySelectorAll('.pc-dim')).toHaveLength(0);
  });

  it('fits every animation inside even a very short dwell', () => {
    play([linkOf({ sparks: 4, speed: 0.25 })], 300);
    for (const call of fx.calls) {
      expect((call.opts.delayMs ?? 0) + call.opts.durationMs).toBeLessThanOrEqual(300);
    }
  });

  it('owns beat handles across replay, step change and exit but not camera work', () => {
    const player: AnimPlayer = {
      animate: (): AnimHandle => ({ cancel: () => { cancelled += 1; } }),
    };
    let cancelled = 0;
    const anim = new FlowAnimator(svg, { player, geometry });
    const camera: AnimHandle = player.animate(svg, [], { durationMs: 10 });
    anim.play(beatOf([linkOf()]), ctx);
    expect(cancelled).toBe(0);
    anim.play(beatOf([linkOf()]), ctx); // replay
    expect(cancelled).toBeGreaterThan(0);
    const afterReplay = cancelled;
    anim.stop();
    expect(cancelled).toBeGreaterThan(afterReplay);
    expect(svg.querySelector('.pc-anim-layer')).toBeNull();
    camera.cancel();
  });

  it('reduced motion shows only the final settled state, with no animation', () => {
    play([linkOf({ bidir: true })], MOTION.stepDelayMs, true);
    expect(fx.calls).toHaveLength(0);
    expect(svg.querySelectorAll('.pc-token:not(.pc-token-static)')).toHaveLength(0);
    const still = svg.querySelector('.pc-token-static');
    expect(still).not.toBeNull();
    expect(still?.getAttribute('transform')).toContain('translate(0, 0)');
    expect(svg.querySelector('.pc-ring')).toBeNull();
  });
});
