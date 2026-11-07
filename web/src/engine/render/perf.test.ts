// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Perf smoke (M2-WP10, N1 evidence for docs/milestones/M2.md): a 300-object
// synthetic scene must render, diff-patch and rebuild under jsdom budgets.
// jsdom has no layout/paint, so these are DOM-cost upper bounds; the in-browser
// pan/drag frame baseline lives in e2e/perf-baseline.spec.ts.
import { describe, it, expect } from 'vitest';
import { SceneRenderer, type Scene } from './scenegraph';
import type { SceneObject } from './shapes';
import type { Kind } from '../model/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const N = 300; // N1 budget ceiling: 60 fps pan/zoom & drag ≤300 objects
const KINDS: Kind[] = [
  'person',
  'system',
  'system_ext',
  'container',
  'component',
  'datastore',
  'queue',
  'group',
  'note',
];

function syntheticScene(n: number, dx = 0, dy = 0): Scene {
  const objects: SceneObject[] = [];
  const cols = 20;
  for (let i = 0; i < n; i++) {
    const kind = KINDS[i % KINDS.length] ?? 'system';
    objects.push({
      id: `o${i}`,
      kind,
      x: (i % cols) * 180 + dx,
      y: Math.floor(i / cols) * 120 + dy,
      w: 160,
      h: 60,
      name: `${kind} ${i}`,
    });
  }
  const links = [];
  for (let i = 0; i + 1 < n; i += 2) {
    links.push({
      id: `l${i}`,
      points: [
        { x: (i % cols) * 180 + 160 + dx, y: Math.floor(i / cols) * 120 + 30 + dy },
        { x: ((i + 1) % cols) * 180 + dx, y: Math.floor((i + 1) / cols) * 120 + 30 + dy },
      ],
    });
  }
  return { objects, links };
}

function timed<T>(fn: () => T): { ms: number; result: T } {
  const t0 = performance.now();
  const result = fn();
  return { ms: performance.now() - t0, result };
}

describe('perf smoke: 300-object scene (N1)', () => {
  it(`initial render of ${N} objects + ${Math.floor(N / 2)} links under budget`, () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    const r = new SceneRenderer(svg);
    const scene = syntheticScene(N);
    const { ms, result: stats } = timed(() => r.render(scene));
    expect(stats.created).toBe(N + Math.floor(N / 2));
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(N);
    // generous CI budget — real browsers are faster than jsdom DOM assembly
    expect(ms).toBeLessThan(1000);
    console.log(`perf: initial render ${N}+${Math.floor(N / 2)}: ${ms.toFixed(1)} ms`);
  });

  it(`move-only re-render (all ${N} translated) is transform swaps only`, () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    const r = new SceneRenderer(svg);
    r.render(syntheticScene(N));
    const moved = syntheticScene(N, 8, 8); // same structure, every node translated
    const { ms, result: stats } = timed(() => r.render(moved));
    expect(stats.created).toBe(0);
    expect(stats.removed).toBe(0);
    expect(stats.updated).toBe(N + Math.floor(N / 2));
    // drag fast path: no node creation, attribute writes only
    expect(ms).toBeLessThan(200);
    console.log(`perf: move-only patch ${N}+${Math.floor(N / 2)}: ${ms.toFixed(1)} ms`);
  });

  it('idempotent re-render (0-op) is near-free', () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    const r = new SceneRenderer(svg);
    const scene = syntheticScene(N);
    r.render(scene);
    const { ms, result: stats } = timed(() => r.render(scene));
    expect(stats).toEqual({ created: 0, updated: 0, removed: 0, reordered: false });
    expect(ms).toBeLessThan(50);
    console.log(`perf: 0-op re-render ${N}+${Math.floor(N / 2)}: ${ms.toFixed(1)} ms`);
  });

  it(`structural rebuild (rename all ${N}) under budget`, () => {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    const r = new SceneRenderer(svg);
    r.render(syntheticScene(N));
    const renamed = syntheticScene(N);
    renamed.objects = renamed.objects.map((o) => ({ ...o, name: `${o.name} renamed` }));
    const { ms, result: stats } = timed(() => r.render(renamed));
    expect(stats.updated).toBe(N);
    expect(stats.created).toBe(0);
    expect(ms).toBeLessThan(600);
    console.log(`perf: structural rebuild ${N}: ${ms.toFixed(1)} ms`);
  });
});
