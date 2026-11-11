// SPDX-License-Identifier: GPL-3.0-only
// Dagre adapter determinism + pin handling tests (M6-WP3 gate per PLAN §8:
// "determinism tests (same input → same output across runs); pin-handling tests").
import { describe, expect, it } from 'vitest';
import { dagreLayoutEngine, dagreLayoutGeometry } from './dagre';
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

  it('reserves rank space for C4 relationship labels', () => {
    const eng = dagreLayoutEngine();
    const r = eng.layout(nodes('web', 'db'), [{ from: 'web', to: 'db', label: 'Reads and writes' }], { dir: 'LR' });
    const gap = r['db']!.x - (r['web']!.x + SZ.width);
    expect(gap).toBeGreaterThanOrEqual('Reads and writes'.length * 7);
  });

  it('compound C4 boundaries enclose members and reserve space around non-members', () => {
    const ns: LayoutNodeInput[] = [
      { id: 'shop', size: { width: 160, height: 60 } },
      { id: 'web', size: { ...SZ }, parent: 'shop' },
      { id: 'db', size: { ...SZ }, parent: 'shop' },
      { id: 'payments', size: { ...SZ } },
    ];
    const result = dagreLayoutGeometry(ns, [{ from: 'web', to: 'db' }, { from: 'web', to: 'payments' }], { dir: 'LR' });
    const group = result.positions['shop']!;
    const size = result.sizes['shop']!;
    for (const id of ['web', 'db']) {
      const p = result.positions[id]!;
      expect(p.x).toBeGreaterThanOrEqual(group.x);
      expect(p.y).toBeGreaterThanOrEqual(group.y);
      expect(p.x + SZ.width).toBeLessThanOrEqual(group.x + size.width);
      expect(p.y + SZ.height).toBeLessThanOrEqual(group.y + size.height);
    }
    const payment = result.positions['payments']!;
    expect(payment.x >= group.x + size.width || payment.y >= group.y + size.height).toBe(true);
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
