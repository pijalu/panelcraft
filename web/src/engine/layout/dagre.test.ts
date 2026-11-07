// SPDX-License-Identifier: GPL-3.0-only
// Dagre adapter determinism + pin handling tests (M6-WP3 gate per PLAN §8:
// "determinism tests (same input → same output across runs); pin-handling tests").
import { describe, expect, it } from 'vitest';
import { dagreLayoutEngine } from './dagre';
import type { LayoutEdgeInput, LayoutNodeInput } from './ports';

const SZ = { width: 120, height: 60 };

function nodes(...ids: string[]): LayoutNodeInput[] {
  return ids.map((id) => ({ id, size: { ...SZ } }));
}

const EDGES: LayoutEdgeInput[] = [
  { from: 'a', to: 'b' },
  { from: 'a', to: 'c' },
  { from: 'b', to: 'd' },
  { from: 'c', to: 'd' },
];

describe('dagreLayoutEngine', () => {
  it('determinism: identical input → identical output across runs', () => {
    const eng = dagreLayoutEngine();
    const r1 = eng.layout(nodes('a', 'b', 'c', 'd'), EDGES, { dir: 'LR' });
    const r2 = eng.layout(nodes('a', 'b', 'c', 'd'), EDGES, { dir: 'LR' });
    expect(r1).toEqual(r2);
  });

  it('determinism: shuffled input arrays → same output as sorted input', () => {
    const eng = dagreLayoutEngine();
    const ordered = eng.layout(nodes('a', 'b', 'c', 'd'), EDGES, { dir: 'LR' });
    const shuffledNodes = nodes('d', 'b', 'a', 'c');
    const shuffledEdges: LayoutEdgeInput[] = [EDGES[2]!, EDGES[0]!, EDGES[3]!, EDGES[1]!];
    const shuffled = eng.layout(shuffledNodes, shuffledEdges, { dir: 'LR' });
    expect(shuffled).toEqual(ordered);
  });

  it('LR: source ranks left of target', () => {
    const eng = dagreLayoutEngine();
    const r = eng.layout(nodes('a', 'b', 'c', 'd'), EDGES, { dir: 'LR' });
    expect(r['a']!.x).toBeLessThan(r['b']!.x);
    expect(r['b']!.x).toBeLessThan(r['d']!.x);
  });

  it('TB: source ranks above target', () => {
    const eng = dagreLayoutEngine();
    const r = eng.layout(nodes('a', 'b', 'c', 'd'), EDGES, { dir: 'TB' });
    expect(r['a']!.y).toBeLessThan(r['b']!.y);
    expect(r['b']!.y).toBeLessThan(r['d']!.y);
  });

  it('pins: pinned node keeps its saved position exactly (FR-V4)', () => {
    const eng = dagreLayoutEngine();
    const ns: LayoutNodeInput[] = [
      { id: 'a', size: { ...SZ } },
      { id: 'b', size: { ...SZ } },
      { id: 'pinned', size: { ...SZ }, pinnedAt: { x: 777, y: 555 } },
      { id: 'c', size: { ...SZ } },
    ];
    const r = eng.layout(ns, [{ from: 'a', to: 'pinned' }], { dir: 'LR' });
    expect(r['pinned']!).toEqual({ x: 777, y: 555 });
    // neighbors still laid out
    expect(r['a']!.x).toBeLessThan(r['pinned']!.x);
  });

  it('parallel edges deduped; duplicate edges do not crash layout', () => {
    const eng = dagreLayoutEngine();
    const r1 = eng.layout(nodes('a', 'b'), [{ from: 'a', to: 'b' }, { from: 'a', to: 'b', label: 'x' }], { dir: 'LR' });
    const r2 = eng.layout(nodes('a', 'b'), [{ from: 'a', to: 'b' }], { dir: 'LR' });
    expect(r1).toEqual(r2);
  });

  it('empty graph → empty result', () => {
    const eng = dagreLayoutEngine();
    expect(eng.layout([], [], { dir: 'TB' })).toEqual({});
  });

  it('isolated node still gets a position', () => {
    const eng = dagreLayoutEngine();
    const r = eng.layout(nodes('lonely'), [], { dir: 'TB' });
    expect(r['lonely']!).toBeDefined();
  });

  it('unknown edge endpoints do not corrupt known positions', () => {
    const eng = dagreLayoutEngine();
    const r = eng.layout(nodes('a', 'b'), [{ from: 'a', to: 'ghost' }], { dir: 'LR' });
    expect(r['a']).toBeDefined();
    expect(r['b']).toBeDefined();
  });
});
