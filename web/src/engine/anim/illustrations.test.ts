// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// F-17 illustration registry: the beat-kind defaults, the resolver fallbacks and
// the DOM end-state each illustration produces (fake player + fake geometry).

import { describe, expect, it, beforeEach } from 'vitest';
import { FlowAnimator, type BeatCtx } from './engine';
import type { AnimHandle, AnimPlayer } from './ports';
import { MOTION } from './timings';
import type { Beat } from '../flows/plan';
import { ILLUSTRATION_IDS, defaultIllustration, resolveIllustration } from './illustrations';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  a: { x: 0, y: 0, w: 120, h: 80 },
  b: { x: 200, y: 0, w: 120, h: 80 },
};
const ctx: BeatCtx = { rectOf: (id) => RECTS[id] ?? null };

interface Call {
  el: Element;
  delayMs: number;
}

function mkPlayer(): { player: AnimPlayer; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    player: {
      animate: (el, _kf, opts): AnimHandle => {
        calls.push({ el, delayMs: opts.delayMs ?? 0 });
        return { cancel: () => {} };
      },
    },
  };
}

function mkSvg(): SVGSVGElement {
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
}

const geometry = { length: () => 100, pointAt: (_p: Element, d: number) => ({ x: d, y: 0 }) };

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

const MSG: Beat = beatOf({
  index: 1,
  kind: 'msg',
  actors: ['a', 'b'],
  links: [{ linkId: 'ab', from: 'a', to: 'b', flipped: false }],
});

describe('illustration registry (F-17)', () => {
  it('exposes all six styles with labels', () => {
    expect(ILLUSTRATION_IDS).toEqual([
      'travel-token', 'pulse', 'sequential-glow', 'packet-burst', 'compare-split', 'trail-fade',
    ]);
  });

  it('defaults per beat kind', () => {
    expect(defaultIllustration('msg')).toBe('travel-token');
    expect(defaultIllustration('process')).toBe('pulse');
    expect(defaultIllustration('par')).toBe('sequential-glow');
    expect(defaultIllustration('info')).toBe('packet-burst');
    expect(defaultIllustration('alt')).toBe('compare-split');
    expect(defaultIllustration('intro')).toBe('trail-fade');
    expect(defaultIllustration('conclusion')).toBe('trail-fade');
  });

  it('a link-based illustration falls back when the beat has no link', () => {
    expect(resolveIllustration('travel-token', 'process', 0)).toBe('pulse');
    expect(resolveIllustration('trail-fade', 'conclusion', 0)).toBe('trail-fade');
    expect(resolveIllustration(null, 'msg', 1)).toBe('travel-token');
    expect(resolveIllustration('packet-burst', 'msg', 1)).toBe('packet-burst');
  });
});

describe('illustration rendering (F-17)', () => {
  let svg: SVGSVGElement;
  let fx: ReturnType<typeof mkPlayer>;

  beforeEach(() => {
    svg = mkSvg();
    fx = mkPlayer();
  });

  const animator = (): FlowAnimator => new FlowAnimator(svg, { player: fx.player, geometry });

  it('travel-token: token + trailing dash', () => {
    animator().play(MSG, ctx);
    expect(svg.querySelector('.pc-token')).not.toBeNull();
    expect(svg.querySelector('.pc-trail')).not.toBeNull();
  });

  it('trail-fade: dash only, no token', () => {
    const a = animator();
    a.setIllustration('trail-fade');
    a.play(MSG, ctx);
    expect(svg.querySelector('.pc-trail')).not.toBeNull();
    expect(svg.querySelector('.pc-token')).toBeNull();
  });

  it('pulse: rings, no travel', () => {
    const a = animator();
    a.setIllustration('pulse');
    a.play(MSG, ctx);
    expect(svg.querySelectorAll('.pc-ring')).toHaveLength(2);
    expect(svg.querySelector('.pc-token')).toBeNull();
  });

  it('sequential-glow: staggered rings and lane links still travel', () => {
    const a = animator();
    a.setIllustration('sequential-glow');
    a.play(MSG, ctx);
    const rings = fx.calls.filter((c) => c.el.classList.contains('pc-ring'));
    const roles = rings.map((c) => c.el.getAttribute('data-role'));
    expect(roles).toEqual(['source-pulse', 'target-pulse']);
    // The glow is now sequenced, not a blanket stagger: the target border
    // pulses when the spark arrives, well after the source pulse starts.
    expect(rings[0]!.delayMs).toBe(0);
    expect(rings[1]!.delayMs).toBeGreaterThan(0);
    expect(svg.querySelector('[data-role="spark"]')).not.toBeNull(); // FR-F4 preserved
  });

  it('packet-burst: six packets leave the actor', () => {
    const a = animator();
    a.setIllustration('packet-burst');
    a.play(beatOf({ index: 1, kind: 'info', actors: ['a'] }), ctx);
    expect(svg.querySelectorAll('.pc-burst')).toHaveLength(6);
  });

  it('compare-split: a divider between the alternatives', () => {
    const a = animator();
    a.setIllustration('compare-split');
    const swapped = { ...MSG, id: 'compare' } as Beat;
    a.play(swapped, ctx);
    const line = svg.querySelector('.pc-split');
    expect(line).not.toBeNull();
    // the divider sits between the two actor centres (60 and 260)
    expect(Number(line?.getAttribute('x1'))).toBe(160);
  });

  it('stop() clears every illustration artefact', () => {
    const a = animator();
    a.setIllustration('packet-burst');
    a.play(beatOf({ index: 1, kind: 'info', actors: ['a'] }), ctx);
    a.stop();
    expect(svg.querySelectorAll('.pc-burst')).toHaveLength(0);
    expect(svg.querySelectorAll('.pc-ring')).toHaveLength(0);
  });
});
