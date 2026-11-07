// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// N1–N3 budget gates (M7-WP2, SPEC §5). Hard assertions in CI: a miss blocks
// milestone exit (PLAN §10.4) — virtualization/culling only if a budget is
// missed, with before/after numbers logged in docs/milestones/M7.md.
// jsdom = DOM-cost upper bound (no layout/paint); in-browser frame baseline
// lives in e2e/perf-baseline.spec.ts (rAF-measured fps).
import { describe, it, expect } from 'vitest';
import { parsePDL } from '../format/parser';
import { docToState } from '../../workspace/workspace';
import { SceneRenderer } from '../render/scenegraph';
import { routeOrtho } from '../render/router';
import type { Scene, SceneLink } from '../render/scenegraph';

/** Emit a PDL source with `n` objects and roughly `n` links (valid grammar). */
function syntheticPdl(n: number): string {
  const lines: string[] = ['pcd 1.0', `title "Perf ${n}"`, 'level container', 'direction LR', ''];
  const kinds = ['system', 'container', 'datastore', 'queue', 'system_ext'];
  for (let i = 0; i < n; i++) {
    const k = kinds[i % kinds.length];
    lines.push(`${k} o${i} "Object ${i}" {`);
    lines.push(`  technology "t${i % 7}"`);
    lines.push(`}`);
  }
  for (let i = 0; i + 1 < n; i += 2) {
    lines.push(`o${i} -> o${i + 1} : "calls"`);
  }
  return lines.join('\n');
}

function timed<T>(fn: () => T): { ms: number; result: T } {
  const t0 = performance.now();
  const result = fn();
  return { ms: performance.now() - t0, result };
}

/** Open pipeline: parse → docToState → routed scene (controller contract). */
function openPipeline(src: string): Scene {
  const parsed = parsePDL(src);
  if (!parsed.doc) throw new Error('synthetic source must parse clean');
  const state = docToState(parsed.doc);
  const byId = new Map(state.objects.map((o) => [o.id, o]));
  const links: SceneLink[] = state.links.flatMap((l) => {
    const from = byId.get(l.from);
    const to = byId.get(l.to);
    if (!from || !to) return [];
    const obstacles = state.objects.filter((o) => o.id !== l.from && o.id !== l.to);
    return [{ id: l.id, points: routeOrtho({ from, to, obstacles }), label: l.label, dashed: l.dashed }];
  });
  return { objects: state.objects, links };
}

describe('N3 — parser perf: 10k-line file parses < 1 s', () => {
  it('10k-line source under 1 s', () => {
    const src = syntheticPdl(3000); // ~10k lines with bodies + links
    expect(src.split('\n').length).toBeGreaterThanOrEqual(9000);
    const { ms, result } = timed(() => parsePDL(src));
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // budget 1000 ms; margin for slow CI runners is generous ×2.5 — real
    // machines parse this in well under 100 ms (log the number either way)
    expect(ms).toBeLessThan(1000);
    console.log(`perf N3: ${src.split('\n').length} lines parsed in ${ms.toFixed(1)} ms`);
  });
});

describe('N2 — open time: 100-object file → interactive < 300 ms', () => {
  it('parse + docToState + first render of 100 objects under 300 ms', () => {
    const src = syntheticPdl(100);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    const t0 = performance.now();
    const scene = openPipeline(src);
    const r = new SceneRenderer(svg);
    r.render(scene);
    const ms = performance.now() - t0;
    // budget 300 ms (SPEC N2, mid-range laptop; jsdom upper bound)
    expect(ms).toBeLessThan(300);
    console.log(`perf N2: 100-object open pipeline ${ms.toFixed(1)} ms`);
  });
});

describe('N1 — 2000 objects usable (render upper bound)', () => {
  it('initial render of 2000 objects + 1000 links completes under CI budget', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    const r = new SceneRenderer(svg);
    const src = syntheticPdl(2000);
    const scene = openPipeline(src);
    const { ms } = timed(() => r.render(scene));
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(2000);
    // "usable" gate — not a frame budget; generous bound so CI stays stable
    expect(ms).toBeLessThan(4000);
    console.log(`perf N1/2000: initial render ${ms.toFixed(1)} ms`);
  });
});
